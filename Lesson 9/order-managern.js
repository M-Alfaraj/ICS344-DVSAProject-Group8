const { LambdaClient, InvokeCommand } = require("@aws-sdk/client-lambda");
const { CognitoIdentityProviderClient, AdminGetUserCommand } = require("@aws-sdk/client-cognito-identity-provider");
const jose = require('node-jose');

function resp(statusCode, bodyObj) {
    return {
        statusCode,
        headers: {
            "Access-Control-Allow-Origin": "*"
        },
        body: JSON.stringify(bodyObj)
    };
}

exports.handler = (event, context, callback) => {
    try {
        if (!event || !event.body || !event.headers) {
            return callback(null, resp(400, { status: "err", message: "Invalid input" }));
        }

        let req;
        let headers;

        try {
            var req = JSON.parse(event.body);
            var headers = event.headers;
        } catch (e) {
            console.log("Input parsing failed:", e);
            return callback(null, resp(400, { status: "err", message: "Invalid input" }));
        }

        // Validatition
        if (!req || typeof req !== "object" || !req.action) {
            return callback(null, resp(400, { status: "err", message: "Invalid input" }));
        }

        if (!headers || typeof headers !== "object") {
            return callback(null, resp(400, { status: "err", message: "Invalid headers" }));
        }

        var auth_header = headers.Authorization || headers.authorization;
        if (!auth_header || typeof auth_header !== "string") {
            return callback(null, resp(401, { status: "err", message: "Missing authorization" }));
        }

        var token_sections = auth_header.split('.');
        if (token_sections.length < 2) {
            return callback(null, resp(401, { status: "err", message: "Invalid token" }));
        }

        let auth_data;
        let token;
        let user;

        try {
            auth_data = jose.util.base64url.decode(token_sections[1]);
            token = JSON.parse(auth_data);
            user = token.username;
        } catch (e) {
            console.log("Token parsing failed:", e);
            return callback(null, resp(401, { status: "err", message: "Invalid token" }));
        }

        if (!user) {
            return callback(null, resp(401, { status: "err", message: "Invalid token" }));
        }

        var params = {
            UserPoolId: process.env.userpoolid,
            Username: user
        };

        const cognitoidentityserviceprovider = new CognitoIdentityProviderClient();
        const command = new AdminGetUserCommand(params);

        cognitoidentityserviceprovider.send(command)
            .then((userData) => {
                try {
                    var len = Object.keys(userData.UserAttributes).length;
                    var isAdmin = false;

                    for (var i = 0; i < len; i++) {
                        if (userData.UserAttributes[i].Name === "custom:is_admin") {
                            isAdmin = userData.UserAttributes[i].Value;
                            break;
                        }
                    }

                    var action = req.action;
                    var isOk = true;
                    var payload = {};
                    var functionName = "";

                    switch (action) {
                        case "new":
                            payload = { "user": user, "cartId": req["cart-id"], "items": req["items"] };
                            functionName = "DVSA-ORDER-NEW";
                            break;

                        case "update":
                            payload = { "user": user, "orderId": req["order-id"], "items": req["items"] };
                            functionName = "DVSA-ORDER-UPDATE";
                            break;

                        case "cancel":
                            payload = { "user": user, "orderId": req["order-id"] };
                            functionName = "DVSA-ORDER-CANCEL";
                            break;

                        case "get":
                            payload = { "user": user, "orderId": req["order-id"], "isAdmin": isAdmin };
                            functionName = "DVSA-ORDER-GET";
                            break;

                        case "orders":
                            payload = { "user": user };
                            functionName = "DVSA-ORDER-ORDERS";
                            break;

                        case "account":
                            payload = { "user": user };
                            functionName = "DVSA-USER-ACCOUNT";
                            break;

                        case "profile":
                            payload = { "user": user, "profile": req["data"] };
                            functionName = "DVSA-USER-PROFILE";
                            break;

                        case "shipping":
                            payload = { "user": user, "orderId": req["order-id"], "shipping": req["data"] };
                            functionName = "DVSA-ORDER-SHIPPING";
                            break;

                        case "billing":
                            payload = { "user": user, "orderId": req["order-id"], "billing": req["data"] };
                            functionName = "DVSA-ORDER-BILLING";
                            break;

                        case "complete":
                            payload = { "orderId": req["order-id"] };
                            functionName = "DVSA-ORDER-COMPLETE";
                            break;

                        case "inbox":
                            payload = { "action": "inbox", "user": user };
                            functionName = "DVSA-USER-INBOX";
                            break;

                        case "message":
                            payload = { "action": "get", "user": user, "msgId": req["msg-id"], "type": req["type"] };
                            functionName = "DVSA-USER-INBOX";
                            break;

                        case "delete":
                            payload = { "action": "delete", "user": user, "msgId": req["msg-id"] };
                            functionName = "DVSA-USER-INBOX";
                            break;

                        case "upload":
                            payload = { "user": user, "file": req["attachment"] };
                            functionName = "DVSA-FEEDBACK-UPLOADS";
                            break;

                        case "feedback":
                            return callback(null, {
                                statusCode: 200,
                                headers: {
                                    "Access-Control-Allow-Origin": "*"
                                },
                                body: JSON.stringify({ "status": "ok", "message": `Thank you ${req["data"]?.["name"] || "user"}.` })
                            });

                        case "admin-orders":
                            if (isAdmin == "true") {
                                payload = { "user": user, "data": req["data"] };
                                functionName = "DVSA-ADMIN-GET-ORDERS";
                                break;
                            } else {
                                return callback(null, {
                                    statusCode: 403,
                                    headers: {
                                        "Access-Control-Allow-Origin": "*"
                                    },
                                    body: JSON.stringify({ "status": "err", "message": "Unauthorized" })
                                });
                            }

                        default:
                            isOk = false;
                    }

                    if (isOk === true) {
                        var invokeParams = {
                            FunctionName: functionName,
                            InvocationType: 'RequestResponse',
                            Payload: JSON.stringify(payload)
                        };

                        const lambda_client = new LambdaClient();
                        const invokeCommand = new InvokeCommand(invokeParams);

                        lambda_client.send(invokeCommand)
                            .then((lambda_response) => {
                                try {
                                    const data = JSON.parse(Buffer.from(lambda_response.Payload).toString());
                                    const response = {
                                        statusCode: 200,
                                        headers: {
                                            "Access-Control-Allow-Origin": "*"
                                        },
                                        body: JSON.stringify(data)
                                    };
                                    callback(null, response);
                                } catch (e) {
                                    console.log("Lambda response parsing failed:", e);
                                    return callback(null, resp(500, { status: "err", message: "Something went wrong" }));
                                }
                            })
                            .catch((e) => {
                                console.log("Invoke failed:", e);
                                return callback(null, resp(500, { status: "err", message: "Something went wrong" }));
                            });
                    } else {
                        return callback(null, {
                            statusCode: 200,
                            headers: {
                                "Access-Control-Allow-Origin": "*"
                            },
                            body: JSON.stringify({ "status": "err", "msg": "unknown action" })
                        });
                    }
                } catch (e) {
                    console.log("Handler processing failed:", e);
                    return callback(null, resp(500, { status: "err", message: "Something went wrong" }));
                }
            })
            .catch((e) => {
                console.log("Cognito lookup failed:", e);
                return callback(null, resp(500, { status: "err", message: "Something went wrong" }));
            });

    } catch (e) {
        console.log("Top-level handler error:", e);
        return callback(null, resp(500, { status: "err", message: "Something went wrong" }));
    }
};