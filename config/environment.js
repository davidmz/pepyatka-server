"use strict";

var Promise = require('bluebird')
  , redis = require('./database')
  , database = redis.connect()
  , config = require('./config').load()
  , passport = require('passport')
  , bodyParser = require('body-parser')
  , auth = require('./initializers/passport').init(passport)
  , env = process.env.NODE_ENV || 'development'
  , morgan = require('morgan')
  , fs = require('fs')
  , winston = require('winston')
  , origin = require('./initializers/origin')

var selectEnvironment = function(app) {
  return new Promise(function(resolve, reject) {
    app.logger = winston
    app.config = config

    app.set('redisdb', config.database)
    app.set('port', process.env.PORT || config.port)

    redis.selectDatabase()
      .then(function() { resolve(app) })
  })
}

exports.init = function(app) {
  app.use(bodyParser.json())
  app.use(bodyParser.urlencoded({ extended: false}))
  app.use(passport.initialize())
  app.use(origin.init)

  var accessLogStream = fs.createWriteStream(__dirname + '/../log/' + env + '.log', {flags: 'a'})
  app.use(morgan('combined', {stream: accessLogStream}))

  return new Promise(function(resolve, reject) {
    selectEnvironment(app)
      .then(function(app) { resolve(app) })
  })
}