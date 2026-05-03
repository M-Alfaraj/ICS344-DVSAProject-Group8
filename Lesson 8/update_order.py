import json
import boto3
import os
from botocore.exceptions import ClientError

# status list: 100: open, 110: payment-failed, 120: paid, 200: processing... [cite: 879]

def lambda_handler(event, context):
    orderId = event["orderId"]
    itemList = event["items"]
    userId = event["user"]

    dynamodb = boto3.resource('dynamodb')
    table = dynamodb.Table(os.environ["ORDERS_TABLE"])

    try:
        # SECURITY FIX: Added attribute_not_exists(billingStarted) to the ConditionExpression.
        # This prevents the item list from being changed if the billing process has locked the record[cite: 1165].
        update_expr = 'SET itemList = :itemList'
        response = table.update_item(
            Key={"orderId": orderId, "userId": userId},
            UpdateExpression=update_expr,
            ConditionExpression="orderStatus <= :max_allowed AND userId = :userId AND attribute_not_exists(billingStarted)",
            ExpressionAttributeValues={
                ':itemList': itemList,
                ':max_allowed': 110,
                ':userId': userId
            }
        )

        if response['ResponseMetadata']['HTTPStatusCode'] == 200:
            res = {"status": "ok", "msg": "cart updated"}
        else:
            res = {"status": "err", "err": "could not update cart"}

    except ClientError as e:
        # If the billing function already set the 'billingStarted' flag, this error triggers[cite: 1163].
        if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
            res = {"status": "err", "msg": "order already paid or in processing — cannot update"}
        else:
            res = {"status": "err", "msg": "unexpected error: " + str(e)}

    return res