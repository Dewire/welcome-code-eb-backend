# Välkommen hit - eb-backend
This is the source code for the eb-backend api of Välkommen hit.

## Getting Started
---------------
```sh
# Install dependencies
npm install

# Start development live-reload server
PORT=8080 npm run dev

# Start production server:
PORT=8080 npm start
```
## Docker Support
------
```sh

# Build your docker
docker build -t es6/api-service .
#            ^      ^           ^
#          tag  tag name      Dockerfile location

# run your docker
docker run -p 8080:8080 es6/api-service
#                 ^            ^
#          bind the port    container tag
#          to your host
#          machine port   
```

## Environment variables
---------------------
Add the variables to a file called __.env.{stage}__ these will be loaded during the webpack buildstep when __NODE_ENV={stage}__. These environment variables will only be awailable during the build process. In order for the variables to be present during runtime the variables have to start with the prefix **EB\___CONSTANT\___**.

### Avaliable environment variables
-------------------------------
-  __REDIS_HOST__
-  __PORT__
-  __GOOGLE_API_KEY__
-  __PORT__ (Port for running node app)
-  __ENC_PASS__ (Secret key for encryption)

## Create environments
-------------------
```sh
# Setting the encryption key
eb setenv ENC_PASS=foo -e eb-dev-welcome
```

## Deploy to AWS
-------------
```sh
# If you don't have eb installed
pip install awsebcli --user --upgrade

# pattern for the different environments is eb-{env}-welcome
# eb deploy <name of eb instance>
eb deploy eb-cont-welcome

# This will only deploy changes in HEAD, to deploy staged files add --staged
# eb deploy <name of eb instance> --staged
eb deploy eb-cont-welcome --staged

# To update the EB config use
# eb config put <name of configuration> --cfg <path to configuration file>
eb config put cont --cfg .elasticbeanstalk/cont.cfg.yml

# Then apply it using
# eb config --cfg <name of configuration> <name of eb instance>
eb config --cfg cont eb-cont-welcome
```
