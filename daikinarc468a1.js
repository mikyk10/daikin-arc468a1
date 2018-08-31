/**
 * Generate a raw IR remote signal for Daikin AC (ARC468A1)
 */
function DaikinArc468A1Encoder() {
	var self = this;
	
	// default fallback parameter
	var defaultProperties = {
		"temperature": 25,     // 14 to 30
		"autotemp"   : 0,      // -5 to +5
		"fan"        : "auto", // 1 to 5, auto, quiet, nice (an intelligent fan control feature)
		"swing"      : false,  // true(on), false(off)
		"state"      : false,  // true(on), false(off)
		"mode"       : "auto", // auto, dry, cold, hot, fan
		"ontimer"    : 0,      // 0 - 12
		"offtimer"   : 0,      // 0 - 12
		"streamer"   : false,  // air purifier -- true(on), false(off)
		//"special"    : null    // null, int-clean, reset-sign
	};
	
	var properties = JSON.parse(JSON.stringify(defaultProperties));;
	
	function bit0Seqeuence() {
		return [440, 440];
	}
	function bit1Seqeuence() {
		return [440, 1300];
	}
	function initSeqeuence() {
		// (425us for on, 425us for off) x 5
		return [440,440,440,440,440,440,440,440,440,440];
	}
	function markerSeqeuence() {
		// 425us for on, 25250us for off, 3450us on, 1750us off
		return [440,25250,3450,1750];
	}
	
	
	this.setTemperature = function(temp) {
		if (temp < 14 || temp > 30) {
			properties.temperature = defaultProperties.temperature;
			return;
		}
		
		properties.temperature = temp;
	}
	
	this.setAutotemp    = function(temp) {
		if (temp < -5 || temp > 5) {
			properties.autotemp = defaultProperties.autotemp;
			return;
		}
		
		properties.autotemp = temp;
	}
	
	this.setFan         = function(fan) {
		if ((Number.isInteger(fan) && (fan < 1 || fan > 5)) || (!Number.isInteger(fan) && fan != "quiet" && fan != "nice" && fan != "auto")) {
			properties.fan = defaultProperties.fan;
			return;
		}
		
		properties.fan = fan;
	}
	
	this.setSwing       = function(swing) {
		properties.swing = (swing == true);
	}
	
	this.setState       = function(state) {
		properties.state = (state == true);
	}
	
	this.setMode        = function(mode) {
		if (mode != "auto" && mode != "dry" && mode != "cold" && mode != "hot" && mode != "fan") {
			properties.mode = defaultProperties.mode;
			return;
		}
		
		properties.mode = mode;
	}
	
	this.setOntimer     = function(hours) {
		if (hours < 0 || hours > 12) {
			properties.ontimer = defaultProperties.hours;
			return;
		}
		
		properties.ontimer = hours;
	}
	
	this.setOfftimer    = function(hours) {
		if (hours < 0 || hours > 12) {
			properties.offtimer = defaultProperties.hours;
			return;
		}
		
		properties.offtimer = hours;
	}
	
	this.setStreamer    = function(streamer) {
		properties.streamer = (streamer == true);
	}
	
	this.encode           = function(obj = {}) {
	
		for (key in obj) {
			var method = "set" + key.charAt(0).toUpperCase() + key.slice(1);
			if (self[method] != undefined) self[method](obj[key]);
		}
		
		var frame1 = new Uint8Array(20);	// 19bytes + checksum(1byte)
		var frame2 = new Uint8Array(19);	// 18bytes + checksum(1byte)
		
		// frame1
		frame1.set([17, 218, 39, 0], 0);
		frame1.set([1, 0, 0, 0], 4);
		
		frame1.set([(properties.fan == "nice"?1:0) << 4, 0, 0, 0], 8);
		frame1.set([0, 0, 0, 0], 12);
		frame1.set([0, 0, 0]   , 16);
		
		var checksum1 = 0;
		for (var i=0; i < frame1.length-1; i++) {
			checksum1 = (checksum1 + frame1[i]) & 0xff;
		}
		
		frame1.set([checksum1] , 19);	// checksum

		// frame2
		frame2.set([17, 218, 39, 0], 0);
		frame2.set([0], 4);
		
		var mode = 0;
		switch (properties.mode) {
			case "auto":
				mode = 0;
				break;
			case "dry":
				mode = 2;
				break;
			case "cold":
				mode = 3;
				break;
			case "hot":
				mode = 4;
				break;
			case "fan":
				mode = 6;
				break;
		}
		frame2.set([
				(properties.state == true?(1<<0):0) |
				(properties.ontimer > 0?(1<<1):0) |
				(properties.offtimer > 0?(1<<2):0) |
				1 << 3 |
				(mode << 4)
		], 5);
		
		var tempByte = 0;
		if (properties.mode == "auto" || properties.mode == "dry") {
			if (properties.autotemp < 0) {
				tempByte = (16 + properties.autotemp) << 1 | 0b11 << 6;
			} else {
				tempByte = properties.autotemp << 1 | 0b11 << 6;
			}
		} else if (properties.mode == "fan") {
			tempByte = 0;
		} else {
			tempByte = properties.temperature << 1
		}
		frame2.set([tempByte], 6);
		
		if (properties.mode == "auto" || properties.mode == "dry") {
			frame2.set([0b10000000], 7);
		} else {
			frame2.set([0], 7);
		}
		
		var swingFan = 0;
		var fan = 0;
		if (Number.isInteger(properties.fan)) {
			fan = properties.fan+2;
		} else if (properties.fan == "auto" || properties.fan == "nice") {
			fan = 0b1010;
		} else if (properties.fan == "quiet") {
			fan = 0b1011;
		}
		swingFan = fan << 4 |(properties.swing ? 0b1111 : 0);
		frame2.set([swingFan], 8);
		
		var timers = 0; // 32bit 
		if (properties.ontimer > 0) {
			timers |= (properties.ontimer * 15) << 10;
		} else {
			timers |= (0b11<<17);
		}
		if (properties.offtimer > 0) {
			timers |= (properties.offtimer * 15) << 22;
		} else {
			timers |= (0b11<<29);
		}
		
		frame2.set([
			((timers >> 0) & 0xFF),
			((timers >> 8) & 0xFF),
			((timers >> 16) & 0xFF),
			((timers >> 24) & 0xFF),
		]   , 9);
		
		frame2.set([
			0,
			0,
			0b11000001,
			(properties.streamer == true?1:0) << 4 | 0x80,
			0,
			0
		]   , 13);
		
		var checksum2 = 0;
		for (var i=0; i < frame2.length-1; i++) {
			checksum2 = (checksum2 + frame2[i]) & 0xff;
		}
		
		frame2.set([checksum2] , 18);	// checksum
		
		/*
		console.log(frame1);
		console.log(frame2);
		
		var str = "";
		for (var i = 0; i < frame1.length; i++) {
			for (var j = 0; j < 8; j++) {
				str += ((frame1[i] >> j) & 0x1) + "\n";
			}
		}

		str += "---MARK---\n";
		
		for (var i = 0; i < frame2.length; i++) {
			for (var j = 0; j < 8; j++) {
				str += ((frame2[i] >> j) & 0x1) + "\n";
			}
		}
		console.log(str);
		*/
		
		var sequence = initSeqeuence();
		sequence = sequence.concat(markerSeqeuence());
		
		for (var i = 0; i < frame1.length; i++) {
			for (var j = 0; j < 8; j++) {
				sequence = sequence.concat( ((frame1[i] >> j) & 0x1)? bit1Seqeuence() : bit0Seqeuence() );
			}
		}
		
		sequence = sequence.concat(markerSeqeuence());
		
		for (var i = 0; i < frame2.length; i++) {
			for (var j = 0; j < 8; j++) {
				sequence = sequence.concat( ((frame2[i] >> j) & 0x1)? bit1Seqeuence() : bit0Seqeuence() );
			}
		}
		
		sequence = sequence.concat(bit0Seqeuence());
		
		return sequence;
	}
}