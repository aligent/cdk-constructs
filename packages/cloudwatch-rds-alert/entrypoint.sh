#!/bin/bash

cd /app

# Detect host user identity and set the permission
DOCKER_UID=`stat -c "%u" /home/node/.aws`
DOCKER_GID=`stat -c "%g" /home/node/.aws`

userdel node
groupadd -g ${DOCKER_GID} node
useradd -g ${DOCKER_GID} --home-dir /home/node -s /bin/bash -u ${DOCKER_UID} node

chown -R node:node /home/node/.config
chown node:node /app
chown -R node:node /app/cdk.out

if [[ $# -gt 0 ]]; then # Headless mode
    INVALIDARGS=()
    while [[ $# -gt 0 ]]; do
        key="${1}"
        case $key in
            --profile)
            profile="${2}"
            shift; shift
            ;;
            --rds-instances)
            instances="${2}"
            shift; shift
            ;;
            --security-group)
            sg="${2}"
            shift; shift
            ;;
            --slack-webhook-url-ssm)
            webhookparameter="${2}"
            shift; shift
            ;;
            --slack-username)
            username="${2}"
            shift; shift
            ;;
            --slack-channel)
            channel="${2}"
            shift; shift
            ;;
            *)    # unknown option
            INVALIDARGS+=("${1}") # save it in an array for error message
            shift
            ;;
        esac
    done
    if [[ ${INVALIDARGS[0]} ]]; then
        echo -en "Invalid argument(s): "
        echo "${INVALIDARGS[*]}"
        exit 1
    fi
    if [[ !(${profile} && ${instances} && ${sg} && ${webhookparameter} && ${username:-RDSAlert} && ${channel}) ]]; then
        echo "Mandatory arguments:"
        echo -e "\t --profile AWS_PROFILE"
        echo -e "\t --rds-instances RDS_INSTANCE_ID(comma-separated if more than one)"
        echo -e "\t --security-group SECURITY_GROUP"
        echo -e "\t --slack-webhook-url-ssm AWS_SSM_PARAMETER_FOR_SLACK_WEBHOOK_URL"
        echo -e "\t --slack-channel SLACK_CHANNEL"
        echo "Optional argument:"
        echo -e "\t --slack-username SLACK_USERNAME (default: RDSAlert)"
        exit 1
    fi
else # Interactive Mode
    echo
    echo ╭━━━┳╮╱╱╱╱╱╭╮╭╮
    echo ┃╭━╮┃┃╱╱╱╱╭╯╰┫┃
    echo ┃┃╱┃┃┃╭━━┳┻╮╭┫┃
    echo ┃╰━╯┃┃┃┃━┫╭┫┃╰╯
    echo ┃╭━╮┃╰┫┃━┫┃┃╰┳╮
    echo ╰╯╱╰┻━┻━━┻╯╰━┻╯
    echo
    echo Configure RDS Alerts and Slack Notification
    echo
    echo Make sure you have completed the below:
    echo
    echo '  1. Bootstrap your environment with CDKv2.x (https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping.html)'
    echo '  2. Create Slack Channel and Incoming Webhook URL (https://api.slack.com/messaging/webhooks)'
    echo '  3. Save the Webhook URL in SSM Parameter store as a SecureString (https://docs.aws.amazon.com/systems-manager/latest/userguide/sysman-paramstore-su-create.html)'
    echo
    read -p 'Are you ready (y/n)? ' ready
    if [[ ! ${ready} =~ ^[Yy]$ ]]; then
        echo
        echo Good call. Bye!
        echo
        exit 1
    fi
    echo
    read -p '- AWS Profile: ' profile
    read -p '- AWS RDS Instance Identifiers (comma-separated with no space in-between): ' instances
    read -p '- AWS SecurityGroup (Grab a random but valid one from your account. CDK just needs this): ' sg
    read -p '- SSM Parameter for the Webhook URL (e.g. /rds_monitor/webhook): ' webhookparameter
    read -p '- Slack Alert Username [RDSAlert] : ' username
    username=${username:-RDSAlert}
    read -p '- Slack Alert Channel without "#" (Only needed for logging and debugging) : ' channel
    echo

    if [[ !(${profile} && ${instances} && ${sg} && ${webhookparameter} && ${username} && ${channel}) ]]; then
        echo "All the parameters need to be provided. Exiting..."
        echo
        exit 1;
    fi
fi

# Deploy the stack
sudo -u node -- sh -c "\
RDSINSTANCES=${instances} SECURITYGROUP=${sg} WEBHOOK_URL_PARAMETER=${webhookparameter} \
ALERT_USERNAME=${username} ALERT_CHANNEL=${channel} \
cdk deploy --profile ${profile}"