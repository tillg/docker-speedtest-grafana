# home.server.docker-compose

A network monitor for my home network. Based on docker-compose and ansible. It uses ideas and code from [frdmn/docker-speedtest-grafana](https://github.com/frdmn/docker-speedtest-grafana).

## Overview

The goal is to have a monitoring of the internet access as I would want it on my small home server. All this packaged in a Docker Compose. And easy to deploy on a fresh Unix server thru an Ansible script.

In a first version, these are the components I have integrated:

![Architecture overview](home_server_dc_overview.png)

At a later stage I could add monitoring of my FritzBox, logging the ping time to google and may be more.

## Getting started

As a first step, make sure the file `hosts` points to the machine you want to provision (i.e. your home server or a local VM if you are testing). To get a starting point you can `cp hosts.sample hosts` and then edit the `hosts` file.

In order to deploy the services, these are the commands that need to be executed:

```bash
# Install the required roles (only needed to run once or if requirements changed)
ansible-galaxy install -r requirements.yml 
ansible-galaxy collection install -r requirements-collections.yml

ansible-playbook setup.yml 
```

Once the infrastructure (i.e. the docker daemon) is installed on the server and you only want to push modifications: 

```bash
ansible-playbook setup.yml --tags deploy
```

In order to see what's happening on the server:

```bash
ssh <Server IP or name>

# To follow the changes 'real time' I usually have one terminal like so:
watch docker ps

```

Once the services are running, Grafana can be accessed in the browser at `http://<IP Address of the server>:80`.

## Configuration

Configurations can be made in the `vars/all.yml` file and are pretty self explanatory.

## Reading

Only partly related...

* [Increase VirtualBox Disk Size](https://linuxhint.com/increase-virtualbox-disk-size/) (after having resized the Virtual Disk with VirtualBox)
* A good showcase using Ansible and Docker Compose: [Ansible-Tutorial: Setup von Docker, MySQL und WordPress mit Ansible [aktualisiert 2020]](https://www.happycoders.eu/de/devops/ansible-tutorial-setup-docker-mysql-wordpress/)
* A fully functioning [Speedtest / InfluxDB / Grafana setup](https://github.com/frdmn/docker-speedtest-grafana)
* [geerlingguy's role](https://github.com/geerlingguy/ansible-role-kubernetes)
* A [tutorial video by Nana](https://www.youtube.com/watch?v=EQNO_kM96Mo&t=828s). And check the [Gitlab Repo](https://gitlab.com/nanuchi/youtube-tutorial-series/-/tree/master/demo-kubernetes-components) that goes with the tutorial and contains all the samples.

