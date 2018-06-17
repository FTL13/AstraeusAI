var Discord = require("discord.js");
var util = require('util');
var http = require('http');
var querystring = require('querystring');
var crypto = require('crypto');
var net = require('net');
var async = require('async');
var exec = util.promisify(require('child_process').exec);
var sys = require('util');
var fs = require('fs');
var http2byond = require('http2byond');
var mysql = require('mysql2');

var bot = new Discord.Client();
var eyes = '👀';

var lastMerge = 0;

var {channels, server_comms_key, bot_key, database} = require('./config.js'); 

bot.on('message', function(msg)
{
    console.log(msg.content)
    var smsg = " " + msg.content + " "
    if(smsg.search(/[\t !?\.,\-_\*]@?ast(raeus|reaus)?[\t !?\.,\-_\*]/i) >= 0)
    {
        msg.reply('You best not be talking about me, you little punk.');
    }
    else if(smsg.search(/(will|is) (the )?server( be)? up/i) >= 0)
    {
        msg.reply('Read the faq. You know what the most frequently asked question is on a ss13 server\'s discord? It\'s "*(when) is the* *server* *up*?". You know whaere you can find the answers to frequently asked questions? The faq channel.');
    }
    else if(msg.content.startsWith(eyes + "covfefe"))
    {
        msg.reply('Reeee covfefe is dead');
    }
    else if(smsg.search(/ftl station/i) >= 0)
    {
        msg.reply('Reeee its a ship not a station get it right');
    }
    else if(msg.content.startsWith(eyes + "help"))
    {
        msg.reply('Commands are started with the eyes emote, followed by the command name. You ain\'t getting any more help out of me, you fuck.');
    }
    else if(smsg.search(/(could|would|should|may|might) +of +(?!course)/i) >= 0) {
        msg.reply('It\'s could HAVE or would HAVE, never could *of* or would *of*');
    }
    else if(msg.content.startsWith(eyes + "status"))
    {
        http2byond({'ip':'ftl13.com','port':'7777','topic':'?status'}, function(body, err) {
            if(err) { msg.reply(err+""); } else {
            body = ''+body;
            dataObj = querystring.parse(body);
            var roundDuration = (Math.floor(dataObj.round_duration/3600)+12)+":"+(Math.floor(dataObj.round_duration/60)%60)
            msg.channel.sendEmbed(new Discord.RichEmbed({"fields":[{"name":"Version","value":dataObj.version,"inline":1},{"name":"Map","value":dataObj.map_name,"inline":1},{"name":"Mode","value":dataObj.mode,"inline":1},{"name":"Players","value":""+dataObj.players,"inline":1},{"name":"Admins","value":""+dataObj.admins,"inline":1},{"name":"Round duration","value":roundDuration,"inline":1},{"name":"Server Link","value":"[byond://ftl13.com:7777](https://ftl13.com/play.php)",inline:0}],"color":34952}));
            }
        });
    }
    var fulladmin = msg.member && msg.member.hasPermission("ADMINISTRATOR");
    var admin = msg.member && msg.member.hasPermission("BAN_MEMBERS");
    if(msg.content.startsWith(eyes + "embed") && admin)
    {
        try {
            msg.channel.sendEmbed(new Discord.RichEmbed(JSON.parse(msg.content.substring(7).replace(/0x[a-fA-F0-9]*/i, (n)=>{return parseInt(n, 16);}))), "").catch(e => {msg.reply(""+e);});
        } catch(e) {msg.reply(""+e);}
    }
    
    if(msg.content.startsWith(eyes + "notes") && admin)
    {
        var culprit = msg.content.substring(7).trim().toLowerCase();
        var connection = connectToMysql();
        connection.execute('SELECT timestamp, server, adminckey, text, type, secret FROM messages WHERE targetckey = ?', [culprit], function(err, results) {
            if(err) {
                bot.channels.get(channels.executivedecisions).sendMessage(JSON.stringify('Error fetching notes for ' + culprit + ': ' + JSON.stringify(err)));
            } else {
                var notesstring = "";
                var embed =  new Discord.RichEmbed({"title": "Notes for " + culprit + ":", "description": "", "color": 0xff4444});
                for(var i = 0; i < results.length; i++) {
                    var row = results[i];
                    embed.addField("---", "**" + row.timestamp + " | " + row.server + "**\n**" + row.type + " by " + row.adminckey + "(" + (+row.secret ? "secret" : "not secret") + ")" + "**\n" + row.text + "\n\n");
                }
                bot.channels.get(channels.executivedecisions).send('', {embed});
            }
        });
        connection.end();
    }
});

bot.on("disconnected", function () {
    bot.login(bot_key);
});

bot.login(bot_key);

function sendServerMessage(message) {
    var request = '?key=' + server_comms_key + '&announce=' + message;
    http2byond({'ip':'ftl13.com','port':'7777','topic':request},function(body,err){});
}

function execRepo(command, callback) {
    console.log('$ ' + command);
    return exec(command, {cwd: "./FTL13"});
}

var isClIng = 0;

async function genchangelogs(bodies) {
    if(isClIng)
        return;
    isClIng = 1;
    var {stdout, stderr} = await execRepo('git fetch --all');
    console.log(stdout + "\n" + stderr);
    ({stdout, stderr} = await execRepo('git reset --hard origin/master'));
    var hasClEd = 0;
    console.log('Generating CL files...');
    var i = 0;
    await new Promise((resolve, reject) => {
        async.each(bodies, (body, callback) => {
            body = body.replace(/\r/g, '');
            console.log('Parsing: ' + body);
            var result = /(?:🆑|:cl:)[ \t]*(.*)\n([\w\W]+)\/(?:🆑|:cl:)/.exec(body);
            if(!result)
                return callback();
            hasClEd = 1;
            var author = result[1];
            var changelog = result[2];
            var pieces = changelog.match(/^(fix|fixes|bugfix|wip|rsctweak|tweaks|tweak|soundadd|sounddel|add|adds|rscadd|del|dels|rscdel|imageadd|imagedel|typo|spellcheck|experimental|experiment|tgs):[ \t]*(.*)$/gm);
            var toOutput = 'author: ' + author + '\ndelete-after: True\nchanges:\n';
            if(!pieces) return callback();
            for(var j = 0; j < pieces.length; j++) {
                var keyval = /^(fix|fixes|bugfix|wip|rsctweak|tweaks|tweak|soundadd|sounddel|add|adds|rscadd|del|dels|rscdel|imageadd|imagedel|typo|spellcheck|experimental|experiment|tgs):[ \t]*(.*)$/gm.exec(pieces[j]);
                if(!keyval)
                    continue;
                var key = keyval[1];
                if(key == 'fix' || key == 'fixes')
                    key = 'bugfix';
                else if(key == 'rsctweak' || key == 'tweaks')
                    key = 'tweak';
                else if(key == 'add' || key == 'adds')
                    key = 'rscadd';
                else if(key == 'del' || key == 'dels')
                    key = 'rscdel';
                else if(key == 'typo')
                    key = 'spellcheck';
                else if(key == 'experimental')
                    key = 'experiment';
                toOutput += '  - ' + key + ': "' + keyval[2].replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"\n';
            }
            console.log(toOutput);
            
            fs.writeFile("./FTL13/html/changelogs/AutoChangeLog-" + i + ".yml", toOutput, callback);
            i++;
        }, () => {resolve();});
    });
    if(!hasClEd) {
        isClIng = 0;
        return;
    }
    console.log(stdout + "\n" + stderr);
    ({stdout, stderr} = await execRepo("python tools/ss13_genchangelog.py html/changelog.html html/changelogs"));
    console.log(stdout + "\n" + stderr);
    ({stdout, stderr} = await execRepo("git add -A"));
    console.log(stdout + "\n" + stderr);
    ({stdout, stderr} = await execRepo("git commit -m \"Automated Changelog [ci skip]\""));
    console.log(stdout + "\n" + stderr);
    ({stdout, stderr} = await execRepo("git push"));
    console.log(stdout + "\n" + stderr);
    isClIng = 0;
}

function prMessage(type, username, usericon, title, num, url, action, actiondoer)
{
    var color = 0xffffff
    if((type == "Pull request" && action == "merged") || (type == "Issue" && action == "closed")) {
        color = 0x44cc44
    } else if(type == "Pull request" && action == "closed") {
        color = 0xcc4444
    }
    bot.channels.get(channels.coderbus).sendEmbed(new Discord.RichEmbed({"author":{"name":username,"icon_url":usericon},"url":url,"title":"(#"+num+") "+title,"description":type+" "+action+" by "+actiondoer,"thumbnail":{"url":"http://i.imgur.com/YXHL3Gd.png"},"color":color}));
}

// Github Webhook

function handleHttpRequest(request, response) {
    var queryData = ''
    if(request.method == 'POST') {
        request.on('data', function(data) {
            queryData += data;
            if(queryData.length > 1000000) {
                queryData = "";
                response.writeHead(413, {'Content-Type': 'text/plain'}).end();
                request.connection.destroy();
            }
        });
        
        request.on('end', function() {
            
            var queryObj = JSON.parse(queryData)
            if(queryObj.issue) {
                if(queryObj.action == 'opened' || queryObj.action == 'closed' || queryObj.action == 'reopened') {
                    prMessage("Issue", queryObj.issue.user.login, queryObj.issue.user.avatar_url, queryObj.issue.title, queryObj.issue.number, queryObj.issue.html_url, queryObj.action, queryObj.sender.login);
                }
            }
            if(queryObj.pull_request) {
                if((queryObj.action == 'opened' || queryObj.action == 'closed' || queryObj.action == 'reopened') && queryObj.pull_request.user.login != 'FTL13-Bot') {
                    if(queryObj.action == 'closed' && queryObj.pull_request.merged) {
                        queryObj.action = 'merged';
                        var date = new Date()
                        lastMerge = date.getTime();
                        genchangelogs([queryObj.pull_request.body]).catch(err => {
                            bot.channels.get(channels.coderbus).sendMessage('Error while generating changelogs: ' + (err.stack ? err.stack : err));
                        });
                    }
                    prMessage("Pull request", queryObj.pull_request.user.login, queryObj.pull_request.user.avatar_url, queryObj.pull_request.title, queryObj.pull_request.number, queryObj.pull_request.html_url, queryObj.action, queryObj.sender.login);
                    sendServerMessage('Pull request ' + queryObj.action + ' by ' + queryObj.sender.login + ' <a href="' + queryObj.pull_request.html_url + '">' + queryObj.pull_request.title + '</a>');
                }
            }
            if(queryObj.commits) {
                if(queryObj.ref != "refs/heads/master") return; // Only track master
                var date = new Date()
                if(date.getTime() > (lastMerge + 1000)) {
                    var commitmsgs = []
                    for(var i = 0; i < queryObj.commits.length; i++) {
                        var commit = queryObj.commits[i];
                        if(commit.author.name == 'FTL13-Bot')
                            continue;
                        commitmsgs.push(commit.message);
                        bot.channels.get(channels.coderbus).sendMessage('Commit added by ' + commit.author.name + ': ' + commit.url + ' (' + commit.message + ')');
                        sendServerMessage('Commit added by ' + commit.author.name + ': <a href="' + commit.url + '">' + commit.message + '</a>');
                    }
                    if(commitmsgs.length)
                        genchangelogs(commitmsgs);
                }
            }
            response.end();
        });
    } else {
        console.log('HTTP Get: ' + request.url);
        if(request.url.indexOf('?') >= 0) {
            dataObj = querystring.parse(request.url.replace(/^.*\?/, ''));
            if(dataObj.announce && dataObj.key && dataObj.key.trim() === server_comms_key.trim()) {
                var announceChannel = channels.ss13;
                if(dataObj.announce_channel) {
                    if(dataObj.announce_channel == 'admin') announceChannel = channels.executivedecisions;
                }
                bot.channels.get(announceChannel).sendMessage(dataObj.announce);
            } else if(dataObj.serverStart && dataObj.key && dataObj.key.trim() === server_comms_key.trim()) {
                bot.channels.get(channels.ss13).sendEmbed(new Discord.RichEmbed({"title":"Server is starting!","description":"[byond://ftl13.com:7777](https://ftl13.com/play.php)"}));
            }
        }
        response.writeHead(405, {'Content-Type': 'text/plain'});
        response.end();
    }
}

function connectToMysql() {
    return mysql.createConnection(database)
}

var http_server = http.createServer(handleHttpRequest);

http_server.listen(8081, function(){
    console.log('HTTP server up!');
});
