#!/bin/sh

until nodejs bot.js; do
    echo 1..
    sleep 1
done
