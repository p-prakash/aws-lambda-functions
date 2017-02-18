## Check AWS Service Terms updates

Open `check_service_term_update.py` file and modify the following configuration to appropriate values.

*configuration items*
> TO = 'noreply@example.com'

> FROM = 'noreply@example.com'

> SMTP_Server = 'SMTP_Server:SMTP_Port'

> SMTP_User = 'SMTP user name'

> SMTP_Password = 'SMTP Password'

Create the zip file by running the command inside `check_service_term_update` directory as shown below.
```
zip -r check_service_term_update.zip ./*
```

Use the following configuration for your Lambda function.

* Runtime: Python 2.7
* Handler: check_service_term_update.lambda_handler
* Role: Basic execution role should be suffice.
* Memory: 128MB
* Timeout: 10 seconds

Configure the Lambda function to run every day at 7:55AM (GMT) which will be 23:55 (PST)

Cron expression: `cron(55 7 * * ? *)`
