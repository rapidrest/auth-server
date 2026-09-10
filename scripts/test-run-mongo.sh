#!/bin/bash
# `-f` is a global docker-compose flag - it must come before the subcommand (`-f <file> up`, not
# `up -f <file>`), or the CLI rejects it outright ("unknown shorthand flag: 'f' in -f"). Every
# subsequent `docker compose` call below also needs the same `-f` or it falls back to looking for a
# nonexistent default `docker-compose.yml` in the CWD ("no configuration file provided: not found").
COMPOSE="docker compose -f docker-compose.mongo.yml"
$COMPOSE up -d --build
startTime=`date +%s`

status=`$COMPOSE ps | grep server-1 | grep 'Up' | grep '(healthy)' | wc -l`
while [[ $status -ne 1 && `expr \`date +%s\` - $startTime` -lt 60 ]]; do
  sleep 1
  echo "Checking server status..."
  $COMPOSE ps
  status=`$COMPOSE ps | grep server-1 | grep 'Up' | grep '(healthy)' | wc -l`
done
if [[ $status -eq 1 ]]
then
    echo -e "\e[32mService started successfully.\e[0m"
	exitCode=0
else
    echo -e "\e[31mService failed to start.\e[0m"
	exitCode=1
fi
$COMPOSE down --rmi local
exit $exitCode
