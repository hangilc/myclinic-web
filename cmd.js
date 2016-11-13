"use strict";

var app = require("./server.js");
var Config = require("myclinic-config");
var path = require("path");
var program = require("commander");
var fs = require("fs");
var mkdirp = require("mkdirp");
var conti = require("conti");
var http = require("http");
var url = require("url");

var defaultSubs = [
	{
		name: "printer",
		module: require("myclinic-drawer-print-server"),
		commandLineArg: function(program){
			this.config["setting-dir"] = program.printerSetting
		}
	},
	{
		name: "service",
		commandLineArg: function(program){
			this.proxy = program.service + "/service"
		}
	}
];

function toInt(val){
	return parseInt(val, 10);
}

function ensureDir(pathname){
	if( !pathname ){
		return;
	}
	if( !fs.existsSync(pathname) ){
		console.log("creating directory:", pathname);
		mkdirp.sync(pathname);
	}
}

function fetchConfig(progServiceUrl, keys, cb){
	console.log(progServiceUrl);
	var config = {};
	var serviceUrl = url.parse(progServiceUrl);
	conti.forEachPara(keys, function(key, done){
		console.log("fetching config for", key);
		var req = http.request({
			protocol: serviceUrl.protocol,
			hostname: serviceUrl.hostname,
			port: serviceUrl.port,
			path: "/config/" + key
		}, function(res){
			res.setEncoding("utf8");
			var data = "";
			res.on("data", function(chunk){
				data += chunk;
			});
			res.on("end", function(){
				config[key] = JSON.parse(data);
				console.log("fetched config for", key);
				done();
			});
			res.on("error", function(err){
				done(err);
			});
		});
		req.on("error", function(err){
			done(err);
		});
		req.end();
	}, function(err){
		if( err ){
			cb(err);
			return;
		}
		cb(undefined, config);
	});
}

function tryAutoConfig(serviceUrl, keys, cb){
	fetchConfig(serviceUrl, keys, function(err, config){
		if( err ){
			if( err.code === "ECONNREFUSED" ){
				console.log("server not responding, trying later...");
				setTimeout(function(){
					tryAutoConfig(serviceUrl, keys, cb);
				}, 10000);
			} else {
				console.log("ERROR: " + err);
			}
			return;
		}
		cb(config);
	});
}

function setupConfig(subs, config){
	subs.forEach(function(sub){
		if( sub.configKey ){
			sub.config = config[sub.configKey];
		} else {
			if( !sub.config ){
				sub.config = {};
			}
		}
	});
}

function setupCmdline(subs, program){
	subs.forEach(function(sub){
		if( sub.commandLineArg ){
			sub.commandLineArg.call(sub, program);
		}
	});
}

function run(subs, config, program){
	setupConfig(subs, config);
	setupCmdline(subs, program);
	console.log(subs);
	app.run({ port: program.port }, subs);
}

function autoConfigKeys(subs){
	var keys = [];
	subs.forEach(function(sub){
		if( sub.configKey ){
			keys.push(sub.configKey);
		}
	});
	return keys;
}

exports.runFromCommand = function(subs, defaultPort, programRunner){
	if( programRunner ){
		programRunner(program);
	}
	program
		.option("-c, --config <configpath>", "Read configuration", "auto")
		.option("-s, --service <service-url>", "Set service server", "http://localhost:9000")
		.option("-p, --port <port>", "Set listening port", toInt, defaultPort)
		.option("--printer-settings <dirname>", "Set printer settings directory", "./printer-settings")
		.parse(process.argv);
	
	var allSubs = subs.concat(defaultSubs);
	if( program.config === "auto" ){
		tryAutoConfig(program.service, autoConfigKeys(allSubs), function(config){
			run(allSubs, config, program);	
		});
	} else {
		run(allSubs, Config.read(program.config), program);
	}
};


