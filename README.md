# ONI-SSO

CLI Tool to Login in AWS with Azure SSO and Google SSO

## Installation

```bash
git clone git@gitlab.com:dnx-br/utilities/oni-sso.git
cd oni-sso
docker build -t oni-sso:latest .
# or use our public image
# docker pull public.ecr.aws/dnxbrasil/oni-sso:latest
```



## Usage
```bash
Usage: oni-sso [options]

Commands:
  auth-google [options]  Command for login by Google SSO
  auth-azure [options]   Command for login by Azure SSO
  auth-aws [options]     Command for login by AWS SSO
  assume-role [options]  Command for assume role

Options:
  -v, --version  Show Version                                         [bool]
      --help     Show help                                            [bool]

You need at least one command
```


## Examples

```bash
# Azure login. Output credentials in console
docker run -v $(pwd):/work --rm -it dnxbrasil/oni-sso:latest auth-azure -a <appUriId> -t <tenatId> -o console

# Google login. Output credentials in console
docker run -v $(pwd):/work --rm -it dnxbrasil/oni-sso:latest auth-google -i <idpid> -s <spid> -o console

# AWS SSO login (Identity source aws). Output credentials in console
docker run -v $(pwd):/work --rm -it dnxbrasil/oni-sso:latest auth-aws -u <url-sso> -o console

# Assume role
docker run -v $(pwd):/work --rm -it dnxbrasil/oni-sso:latest assume-role -r <role-arn> -o console

# Assume role output profile
docker run -v $(pwd):/work -v /home/<you-user>/.aws/credentials:/profile/credentials --rm -it dnxbrasil/oni-sso:latest assume-role -r <role-arn> -o profile -p dev

# Assume role output one (for one-cli)
docker run -v $(pwd):/work -v /home/<you-user>/.one/secrets:/one/secrets --rm -it dnxbrasil/oni-sso:latest assume-role -r <role-arn> -o one

# Assume role ouput env (for makefile dnx). Create file .env.auth
docker run -v $(pwd):/work  --rm -it dnxbrasil/oni-sso:latest assume-role -r <role-arn> -o env


```

## MFA Support

| Provider        | Support?           | Types  |
| ------------- |:-------------:| -----:|
| Google      | yes | `Msg Code Text and Voice`, `Google Requests`, `Google Authenticate` |
| Azure      | yes      |   `Msg Code Text and Voice` |
| AWS | no      |   *comming...* |

## Common auth-* and assume-role option
```bash
  -o, --output-format     Credentials output format
                 [string] [options: "console", "one", "env", "export", "profile"]
  -d, --duration-seconds  AWS Session duration in seconds[number] [default: 3600]
  -p, --profile-name      AWS profile name          [string] [default: "default"]
```
> WARNING: assume-role not work with auth-aws

## Extra settings
* Login in AWS use default region us-east-1 if environment variable AWS_DEFAULT_REGION is not set
* To avoid setting the appIdUri and tenantId every time on azure login, export the environment variables AZURE_APP_ID_URI and TENANT_ID

* To avoid setting the idpId and spId every time on google login, export the environment variables GOOGLE_IDPID and GOOGLE_SPID


## Contributing
Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

Please make sure to update tests as appropriate.

## Author

Managed by [DNX Brasil](https://github.com/DNX-BR/).

## License

Apache 2 Licensed. See [LICENSE](https://github.com/DNXLabs/one-cli/blob/master/LICENSE) for full details.
