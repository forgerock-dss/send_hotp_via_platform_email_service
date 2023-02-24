/**
 * @file This script sends a HOTP to a user via the IDM SendGrid Email Service
 * NOTE - The use of SendGrid is not supported in Production and must be changed to your own email service
 * Steps are here: https://backstage.forgerock.com/docs/idcloud/latest/tenants/email-provider.html#external_smtp_email_server
 * @version 0.2.0
 * @keywords email mail hotp sharedState transientState
 */

/**
 * Environment specific config 
 * Ensure the esv-tenant-fqdn is set as per the steps in this repo:
 * https://stash.forgerock.org/projects/CS/repos/common_get_access_token_for_idm/browse/src/am
 */

/**
 * Full Configuration 
 */

var config = {
    tenantFqdn: "esv.tenant.fqdn",
    ACCESS_TOKEN_STATE_FIELD: "idmAccessToken",
    nodeName: "***sendHotpIDMEmailService"
};

/**
 * Node outcomes
 */

var NodeOutcome = {
    PASS: "sent",
    FAIL: "noMail",
    ERROR: "error"
};

/**
 * Log an HTTP response
 * 
 * @param {Response} HTTP response object
 */

function logResponse(response) {
    logger.message(config.nodeName + ": Scripted Node HTTP Response: " + response.getStatus() + ", Body: " + response.getEntity().getString());
}

/**
 * Send email via the IDM Email Service
 * 
 * @param {string} username - username of the user retrieved from sharedState
 * @param {string} accessToken - Access Token retrieved from transientState
 * @param {string} fqdn - Tenant fully qualified domain name retreived from an ESV
 * @param {string} hotp - HOTP retrieved from transientState
 * @param {string} mail - mail attribute retrieved from the idRepository. Note if this is a registration journey acquire mail from sharedState
 */

function sendMail(username, accessToken, fqdn, hotp, mail) {
    var idmEndpoint = "https://" + fqdn + "/openidm/external/email?_action=send";
    var response;

    logger.message(config.nodeName + ": Sending email via the IDM email service for user: " + username + " with mail address: " + mail + " and HOTP: " + hotp);

    try {
        var request = new org.forgerock.http.protocol.Request();
        var requestBodyJson = {
            "from": "saas@forgerock.com",
            "to": mail,
            "subject": "One Time Password",
            "body": "Here is your One Time Password. Please enter it into the login browser window: " + hotp
        };
        request.setMethod('POST');
        request.setUri(idmEndpoint);
        request.getHeaders().add("Authorization", "Bearer " + accessToken);
        request.getHeaders().add("Content-Type", "application/json");
        request.setEntity(requestBodyJson);
        response = httpClient.send(request).get();
    }
    catch (e) {
        logger.error(config.nodeName + ": Unable to call IDM Email endpoint. Exception: " + e);
        return NodeOutcome.ERROR;
    }
    logResponse(response);

    if (response.getStatus().getCode() === 200) {
        logger.message(config.nodeName + ": Email sent for user: " + username + " with email: " + mail);
        return NodeOutcome.PASS;
    }
    else if (response.getStatus().getCode() === 401) {
        logger.error(config.nodeName + ": Access token is invalid: " + response.getStatus() + " for user: " + username);
        return NodeOutcome.ERROR;
    }
    else if (response.getStatus().getCode() === 404) {
        logger.error(config.nodeName + " IDM Email endpoint not found. HTTP Result: " + response.getStatus() + " for idmEndpoint: " + idmEndpoint);
        return NodeOutcome.ERROR;
    }
    //Catch all error 
    logger.error(config.nodeName + ": HTTP 5xx or Unknown error occurred. HTTP Result: " + response.getStatus());
    return NodeOutcome.ERROR;
}

/**
 * Node entry point
 */

logger.message(config.nodeName + ": node executing");

var username;
var accessToken;
var idmEndpoint;
var hotp;
var mail;

if (!(username = nodeState.get("_id").asString())) {
    logger.error(config.nodeName + ": Unable to retrieve username from sharedState");
    outcome = NodeOutcome.ERROR;
}

else if (!(accessToken = nodeState.get(config.ACCESS_TOKEN_STATE_FIELD).asString())) {
    logger.error(config.nodeName + ": Unable to retrieve Access Token from transientState");
    outcome = NodeOutcome.ERROR;
}

else if (!(fqdn = systemEnv.getProperty(config.tenantFqdn))) {
    logger.error(config.nodeName + ": Unable to retrieve tenant from ESV called: " + config.tenantFqdn);
    outcome = NodeOutcome.ERROR;
}

else if (!(hotp = nodeState.get("oneTimePassword").asString())) {
    logger.error(config.nodeName + ": Unable to retrieve HOTP from transientState");
    outcome = NodeOutcome.ERROR;
}
//If this is a registration journey adapt the following to try retrieve from sharedState
else if (!(mail = String(idRepository.getAttribute(username, "mail").toArray()[0].toString()))) {
    logger.error(config.nodeName + ": Unable to retrieve mail attribute from the idRepository");
    outcome = NodeOutcome.FAIL;
}

//Execute function to send mail via IDM EMail Service
else {
    outcome = sendMail(username, accessToken, fqdn, hotp, mail);
}