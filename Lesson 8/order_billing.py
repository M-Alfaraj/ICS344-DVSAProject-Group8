import json
import urllib3
import boto3
import os
import time
import decimal
from decimal import Decimal
from botocore.exceptions import ClientError

def lambda_handler(event, context):
    # Helper class to convert a DynamoDB item to JSON[cite: 906].
    class DecimalEncoder(json.JSONEncoder):
        def default(self, o):
            if isinstance(o, decimal.Decimal):
                return float(o) if o % 1 > 0 else int(o)
            return super(DecimalEncoder, self).default(o)

    orderId = event["orderId"]
    userId = event["user"]
    http = urllib3.PoolManager()
    dynamodb = boto3.resource('dynamodb')
    table = dynamodb.Table(os.environ["ORDERS_TABLE"])

    # STEP 1: ATOMIC LOCK AND DATA RETRIEVAL [cite: 1165]
    # We set billingStarted flag and lock status as the first step.
    # ReturnValues="ALL_OLD" gives us the items exactly as they were before the lock.
    try:
        response = table.update_item(
            Key={"orderId": orderId, "userId": userId},
            UpdateExpression="SET orderStatus = :processing, billingStarted = :flag",
            ConditionExpression="orderStatus <= :max_allowed AND attribute_not_exists(billingStarted)",
            ExpressionAttributeValues={
                ':processing': 200,
                ':flag': True,
                ':max_allowed': 110
            },
            ReturnValues="ALL_OLD" 
        )
    except ClientError as e:
        if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
            return {"status": "err", "msg": "order already paid or in processing"}
        else:
            return {"status": "err", "msg": "unexpected error: " + str(e)}

    # Extract items from the 'Attributes' of the OLD version of the record[cite: 931].
    old_attributes = response.get("Attributes", {})
    status = int(json.dumps(old_attributes.get('orderStatus', 100), cls=DecimalEncoder))
    itemList = old_attributes.get('itemList', {})

    if not itemList:
        # Rollback lock if no items found
        table.update_item(
            Key={"orderId": orderId, "userId": userId},
            UpdateExpression="SET orderStatus = :open REMOVE billingStarted",
            ExpressionAttributeValues={':open': 100}
        )
        return {"status": "err", "msg": "could not find order"}

    if status < 120:
        # Map frozen items to dictionary for the totalizer[cite: 902].
        data_dict = [{"itemId": key, "quantity": int(value)} for key, value in itemList.items()]
        data = json.dumps(data_dict, cls=DecimalEncoder)
        
        # GET TOTAL FOR BILLING
        url = os.environ["GET_CART_TOTAL"]
        req = http.request("POST", url, body=data, headers={'Content-Type': 'application/json'})
        res = json.loads(req.data)
        cartTotal = float(res['total'])
        missings = res.get("missing", {})
            
        # SEND BILLING DATA TO PAYMENT [cite: 921]
        payment_url = os.environ["PAYMENT_PROCESS_URL"]
        payment_data = json.dumps(event["billing"])
        req_payment = http.request("POST", payment_url, body=payment_data, headers={'Content-Type': 'application/json'})
        res_payment = json.loads(req_payment.data)
        ts = int(time.time())

        if res_payment['status'] == 110:
            # Payment failed: Unlock the order so the user can try again[cite: 1165].
            table.update_item(
                Key={"orderId": orderId, "userId": userId},
                UpdateExpression="SET orderStatus = :failed REMOVE billingStarted",
                ExpressionAttributeValues={':failed': 110}
            )
            return {"status": "err", "msg": "invalid payment details"}

        elif res_payment['status'] == 120:
            # Payment success: Finalize order and remove lock[cite: 921].
            update_expression = 'SET orderStatus = :orderstatus, paymentTS = :paymentTS, totalAmount = :total, confirmationToken = :token REMOVE billingStarted'
            TWOPLACES = Decimal(10) ** -2
            expression_attributes = {
                ':orderstatus': res_payment['status'],
                ':paymentTS': ts,
                ':total': Decimal(cartTotal).quantize(TWOPLACES),
                ':token': res_payment['confirmation_token']
            }
            
            if missings:
                new_item_list = {item: (itemList[item] - missings[item] if item in missings else itemList[item]) for item in itemList}
                expression_attributes[":il"] = new_item_list
                update_expression = 'SET orderStatus = :orderstatus, paymentTS = :paymentTS, totalAmount = :total, confirmationToken = :token, itemList = :il REMOVE billingStarted'

            try:
                table.update_item(Key={"orderId": orderId, "userId": userId}, UpdateExpression=update_expression, ExpressionAttributeValues=expression_attributes)
                # Notify SQS for background processing[cite: 922].
                boto3.client('sqs').send_message(QueueUrl=os.environ["SQS_URL"], MessageBody=json.dumps({"orderId": orderId, "userId": userId}))
                return {"status": "ok", "amount": float(cartTotal), "token": res_payment['confirmation_token'], "missing": missings}
            except Exception as e:
                return {"status": "err", "msg": "unknown error during final update"}
        else:
            # Generic failure: Restore order to open status[cite: 1203].
            table.update_item(Key={"orderId": orderId, "userId": userId}, UpdateExpression="SET orderStatus = :open REMOVE billingStarted", ExpressionAttributeValues={':open': 100})
            return {"status": "err", "msg": "could not process payment"}
    else:
        return {"status": "err", "msg": "order already made"}