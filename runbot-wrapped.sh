#!/bin/sh

until node bot.js; do
    echo 1..
    sleep 1
done
