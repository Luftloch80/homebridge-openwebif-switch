const ping = require('./hostportconnectable');
const request = require('request');
const xmlParser = require('xml2js').parseString;
var inherits = require('util').inherits;

var Openwebif = function (host, port, log) {
  this.host = host;
  this.port = port;
  this.log = log;
};



Openwebif.prototype._httpXMLGetForMethod =  function (method, callback) {
  if (!this.host) {
    this.log.error("No Host defined in method: " + method);
    callback(new Error("No host defined."));
  }
  if (!this.port) {
    this.log.error("No Port defined in method: " + method);

    callback(new Error("No port defined."));
  }
  var me = this;
  ping.checkHostIsReachable(this.host, this.port, function (reachable) {
    if (reachable) {
      me._httpRequest("http://" + me.host + ":" + me.port + method , '', 'GET', function (error, response, responseBody) {
        if (error) {
          me.log('%s() failed: %s', method, error.message);
          callback(error, null);
        } else {
          try {
            var result = xmlParser(responseBody, function(err, data) {
              if (err) {
                callback(err, null);
                me.log('error parsing: ' + err);
              } else {
                me.log('parsed xml for method %s', method);
                callback(null, data);
              }
            });
          } catch (e) {
            callback(e, null);
            me.log('error parsing: ' + e);
          }
        }
      }.bind(this));
    } else {
      me.log.error("Device not reachable" + me.host + ":" + me.port + " in method: " + method);

      callback(new Error("device is off"), null); //totally off
    }
  });
};

Openwebif.prototype._httpRequest = function (url, body, method, callback) {
  request({
    url: url,
    body: body,
    method: method,
    rejectUnauthorized: false
  },
  function (error, response, body) {
    callback(error, response, body);
  });
};

Openwebif.prototype.getDiscSpace = function (callback) {
  var me = this;
  this._httpXMLGetForMethod("/web/about", function (error,data) {
    if (error){
      callback(error)
    } else {
      var freexmlValue = data.e2abouts.e2about[0].e2hddinfo[0].free;
      var freeDouble = parseFloat(freexmlValue);
      var capacityxmlValue = data.e2abouts.e2about[0].e2hddinfo[0].capacity;
      var capacityDouble = parseFloat(capacityxmlValue);
      var percentage = (freeDouble / capacityDouble) * 100;
      var characteristicValue = percentage;// (percentage / 5.0) - 10.0; //auf 20 runterrechnen und auf -10 bis 10 ummappen.
      me.log("received volume from vusolo: " + freexmlValue + " mapped to " + characteristicValue);
      callback(null, characteristicValue);
    }
  });
}

Openwebif.prototype.getVolumeAndMute =  function (callback) {
  var me = this;
  this._httpXMLGetForMethod("/web/vol", function (error,data) {
    if (error){
      callback(error)
    } else {
      var xmlValue = data.e2volume.e2current[0];
      var xmlMuteValue = data.e2volume.e2ismuted[0];
      var percentage = parseFloat(xmlValue);
      var boolMute = xmlMuteValue == "True";
      var characteristicValue = percentage;// (percentage / 5.0) - 10.0; //auf 20 runterrechnen und auf -10 bis 10 ummappen.
      me.log("received volume from vusolo: " + xmlValue + " mapped to " + characteristicValue);
      callback(null, characteristicValue, boolMute);
    }
  });
}



Openwebif.prototype.setMute =  function (value, callback) {
  var me = this;
  var	targetValue = value ? true : false; //number to boolean
  me.getVolumeAndMute(function (error, charValue,  muteCurrent) {
    if(error){
      callback(null, targetValue ? false : true); //totally off ->
    } else {
      if (muteCurrent == targetValue) {
        //state like expected. nothing to do
        callback(null, targetValue);
      } else { //State setzen
        me._httpXMLGetForMethod("/web/vol?set=mute", function (error,data) {
          if (error){
            me.log('setMute() failed: %s', error.message);
            callback(error)
          } else {
            me.log('setMute() succeded');
            callback(null, targetValue);
          }
        });
      } //if
    }
  });
}

Openwebif.prototype.getPowerState =  function (callback) {
  var me = this;
  this._httpXMLGetForMethod("/web/powerstate", function (error,data) {
    if (error){
      callback(error)
    } else {
      var xmlValue = data.e2powerstate.e2instandby[0];
      var powerOn = xmlValue.includes("false");
      me.log("power on value'" + xmlValue +"'powerOnValue " + powerOn);
      var characteristicValue = powerOn;
      callback(null, characteristicValue);
    }
  });
},

Openwebif.prototype.setVolume =  function (value, callback) {
  var me = this;
  var targetValue = parseInt(value);
  this.log("setVolume" + value);
  this._httpXMLGetForMethod("/web/vol?set=set" + targetValue, function (error,data) {
    if (error){
      me.log('getVolume() failed: %s', error.message);
      callback(error)
    } else {
      callback(null, targetValue);

    }
  });
},
Openwebif.prototype.setPowerState = function (powerOn, callback) {
  powerOn = powerOn ? true : false; //number to boolean
  var me = this;
  me.log('Power state change request: ', powerOn);
  me.getPowerState(function (error, powerOnCurrent) {
    if(error){
      callback(null, powerOn ? false : true); //totally off ->
    } else {
      if (powerOnCurrent == powerOn) {
        //state like expected. nothing to do
        callback(null, powerOn);
      } else { //State setzen
        me._httpXMLGetForMethod("/web/powerstate?newstate=0", function (error,data) {
          if (error){
            me.log('setPowerState() failed: %s', error.message);
            callback(error)
          } else {
            me.log('setPowerState() succeded');
            var xmlValue = data.e2powerstate.e2instandby[0];
            var powerOn = xmlValue.includes("false");
            me.log('power is currently %s', powerOn ? 'ON' : 'OFF');
            callback(null, powerOn);
          }
        });
      } //if
    }
  });
}
Openwebif.prototype.getMute = function (callback) {
  var me = this;
  this.getVolumeAndMute(function (error,characteristicValue, mute) {
    if (error){
      callback(error)
    } else {
      callback(null, mute);
    }
  });
},
Openwebif.prototype.getVolume = function (callback) {
  var me = this;
  this.getVolumeAndMute(function (error,characteristicValue, mute) {
    if (error){
      callback(error)
    } else {
      callback(null, characteristicValue);
    }
  });
}
Openwebif.prototype._printBouquets =  function() {
  var me = this;
  this._httpXMLGetForMethod("/web/getservices", function (error,data) {
    if (error){
    } else {
      var servicList = data.e2servicelist.e2service;
      me._printBouquetsDetail(servicList, new Array());

      var arrayLength = servicList.length;
      for (var i = 0; i < arrayLength; i++) {
        var service = servicList[i];

      }

    }
  });
},
Openwebif.prototype._printBouquetsDetail =  function(bouquets, printArray) {
  if (bouquets == undefined || bouquets == null || bouquets.length <= 0) {
    var string =  JSON.stringify(printArray, null, 2);
    this.log('JSON for adding to bouquet array in config in openwebif accessory under key bouquets: %s', string);
    return;
  }
  let bouquet = bouquets[0];
  bouquets.shift();

  let name = bouquet.e2servicename[0];
  let ref = bouquet.e2servicereference[0];
  var me = this;
  this._httpXMLGetForMethod("/web/getservices?sRef=" + ref, function (error,data) {
    if (error){
    } else {
      var servicList = data.e2servicelist.e2service;
      var arr = [];

      var arrayLength = servicList.length;
      for (var i = 0; i < arrayLength; i++) {
        var service = servicList[i];
        let name = service.e2servicename[0];
        let ref = service.e2servicereference[0];
        var object = {"name":name, "reference": ref};
        arr.push(object);
      }
      var json = {"name":name, "reference": ref, "channels" : arr };
      printArray.push(json)
      // me.log('JSON for adding to bouquet array in config: %s', string);
      me._printBouquetsDetail(bouquets, printArray);

    }
  });
},
Openwebif.prototype.getCurrentServiceReference =  function (callback) {
  var me = this;
  this._httpXMLGetForMethod("/web/getcurrent", function (error,data) {
    if (error){
      callback(error)
    } else {
      var title = data.e2currentserviceinformation.e2eventlist[0].e2event[0].e2eventservicereference;
      callback(null, String(title));
    }
  });
},
Openwebif.prototype.setCurrentChannelWithRef =  function (ref, callback){
  this._httpXMLGetForMethod("/web/zap?sRef=" + ref,  function (error,data) {
    callback(error);
  });
}
Openwebif.prototype.sendCommand = function (command, callback) {
  this._httpXMLGetForMethod("/web/remotecontrol?command=" + command, function (error,data) {
    if (error){
      me.log('sendCommand() failed: %s', error.message);
      callback(error)
    } else {      callback(null);

    }
  });
}
// var RemoteKey = {  };
Openwebif.RemoteKey =  {}
// These Are the Default Keys from Used in Homekit.
Openwebif.RemoteKey.REWIND = 168;
Openwebif.RemoteKey.FAST_FORWARD = 159;
Openwebif.RemoteKey.NEXT_TRACK = 407;
Openwebif.RemoteKey.PREVIOUS_TRACK = 412;
Openwebif.RemoteKey.ARROW_UP = 103;
Openwebif.RemoteKey.ARROW_DOWN = 108;
Openwebif.RemoteKey.ARROW_LEFT = 105;
Openwebif.RemoteKey.ARROW_RIGHT = 106;
Openwebif.RemoteKey.SELECT = 352; //OK
Openwebif.RemoteKey.BACK = 174; // exit;
Openwebif.RemoteKey.EXIT = 174;
Openwebif.RemoteKey.PLAY_PAUSE = 164;
Openwebif.RemoteKey.INFORMATION = 139; // menu button

module.exports =  Openwebif;
