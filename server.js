"use strict";

var express = require("express");
var bodyParser = require("body-parser");
var httpProxy = require("http-proxy");

exports.run = function(config, subs){
	var app = express();
	var port = config.port;

	subs.forEach(function(sub){
		var name = sub.name;
		if( !name ){
			throw new Error("cannot find sub name");
		}
		if( sub.proxy ){
			var proxy = httpProxy.createProxyServer({});
			app.use("/" + name, function(req, res){
				proxy.web(req, res, { target: sub.proxy }, function(e){
					res.status(500).send({ error: e });
				});
			});
		} else {
			var subapp = express();
			var mod = sub.module;
			var conf = sub.config;
			subapp.use(bodyParser.urlencoded({ extended: false }));
			subapp.use(bodyParser.json());
			mod.initApp(subapp, conf);
			if( mod.staticDir ){
				subapp.use(express.static(mod.staticDir));
			}
			app.use("/" + name, subapp);
		}
	});

	app.listen(port, function(){
		console.log("practice web server listening to " + port);
	})
};

