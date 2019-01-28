import { Injectable } from '@angular/core';



import { Socket } from 'net';

import { OrderModel } from '../models/order.model'
import { BehaviorSubject } from '../../../node_modules/rxjs';

@Injectable({
  providedIn: 'root'
})


export class CobasService {


  private statusSubject = new BehaviorSubject(false);
  currentStatus = this.statusSubject.asObservable();

  private net = require('net');

  private connectionTriesSubject = new BehaviorSubject(false);
  stopTrying = this.connectionTriesSubject.asObservable();

  private ACK = Buffer.from('06', 'hex');
  private ENQ = Buffer.from('05', 'hex');
  private SOH = Buffer.from('01', 'hex');
  private STX = Buffer.from('02', 'hex');
  private ETX = Buffer.from('03', 'hex');
  private EOT = Buffer.from('04', 'hex');
  private CR = Buffer.from('13', 'hex');
  private LF = Buffer.from('10', 'hex');
  private NAK = Buffer.from('21', 'hex');

  private strData: string = '';
  private connectopts: any = null;
  private settings = null;
  private orderModel = null;

  public socketClient = null;
  public server = null;

  public connectionTries = 0;
  public hl7parser = require("hl7parser");  


  constructor() {

    const Store = require('electron-store');
    const store = new Store();

    this.settings = store.get('appSettings');

    this.connectopts = {
      port: this.settings.rochePort,
      host: this.settings.rocheHost
    }

    this.orderModel = new OrderModel;

  }

  // Method used to track machine connection status
  connectionStatus(isRocheConnected: boolean) {
    this.statusSubject.next(isRocheConnected);
  }

  // Method used to track machine connection status
  stopTryingStatus(stopTrying: boolean) {
    this.connectionTriesSubject.next(stopTrying);
  }

  hl7ACK(messageID){

    if(!messageID){
      messageID = Math.random();
    }

    var moment = require('moment');
    var date = moment(new Date()).format('MM/DD/YYYY');;



    let ack = "MSH|^~\&|LIS||COBAS6800/8800||"+date+"||ACK^R22|ACK-R22-"+date+"||2.5||||||8859/1";
        ack += "MSA|AA|" + messageID;

    return ack;    
  }


  // Method used to connect to the Roche Machine
  connect() {
    let that = this;

    if (that.settings.rocheConnectionType == "tcpserver") {
      this.server = that.net.createServer(function (socket) {
        // confirm socket connection from client
        console.log((new Date()) + 'A client connected to server...');
        that.connectionStatus(true);
        socket.on('data', function (data) {

          that.handleTCPServerResponse(this.server, data, 'hl7');
          

        });
      }).listen(this.settings.rochePort, this.settings.rocheHost);


      this.server.on('error', function (e) {
        if (e.code == 'EADDRINUSE') {
          console.log('Address in use, retrying...');
          setTimeout(function () {
            this.server.close();
            this.server.listen(this.settings.rochePort, this.settings.rocheHost);
          }, 1000);
        }else{
          console.log('Some error : ' + e.code);
        }
      });      

    } else {


      that.socketClient = new Socket();


      console.log('Roche Cobas - Trying to connect as client');
      this.connectionTries++; // incrementing the connection tries

      that.socketClient.connect(that.connectopts, function () {
        this.connectionTries = 0; // resetting connection tries to 0
        that.connectionStatus(true);
        console.log('Roche Cobas - Connected as client');
      });

      that.socketClient.on('data', function (data) {
        that.connectionStatus(true);
        that.handleTCPClientResponse(that.socketClient, data);
      });

      that.socketClient.on('close', function () {
        that.socketClient.destroy();
        that.connectionStatus(false);
        console.log('Roche Cobas - client Disconnected');
      });

      that.socketClient.on('error', (e) => {
        that.connectionStatus(false);
        console.log(e);
        if (e) {
          // if we have already tried and failed multiple times, we can stop trying
          if (this.connectionTries <= 2) {
            setTimeout(() => {
              console.log('Roche Cobas - Trying to connect as client');
              this.connectionTries++; // incrementing the connection tries
              that.socketClient.connect(that.connectopts, function () {
                this.connectionTries = 0; // resetting connection tries to 0
                that.connectionStatus(true);
                console.log('Roche Cobas - Connected as client again !');
              });
            }, 5000);
          } else {
            console.log('Giving up. Not trying again. Something wrong !');
            that.connectionStatus(false);
            that.stopTryingStatus(true);
          }
        }
      });
    }




  }

  reconnect() {
    if (this.socketClient) {
      this.socketClient.destroy();
      this.connectionStatus(false);
      this.connect();
    }
    if (this.server) {
      this.server.destroy();
      this.connectionStatus(false);
      this.connect();
    }    
    
  }

  closeConnection() {
    if (this.socketClient) {
      this.socketClient.destroy();
      this.connectionStatus(false);
    }
    if (this.server) {
      this.server.destroy();
      this.connectionStatus(false);
    }
  }



  hex2ascii(hexx) {
    var hex = hexx.toString();//force conversion
    var str = '';
    for (var i = 0; i < hex.length; i += 2)
      str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
    return str;
  }


  parseHl7Result(data) {
    var d = data.toString("hex");
    var msgg = this.hex2ascii(d);

    // console.log(data);
    // console.log(JSON.stringify(data, null, 4));

    // console.log(d);
    // console.log(JSON.stringify(d, null, 4));

    console.log("==== STARTING ====");

    msgg = msgg.replace(/[\x0b\x1a]/g, '');
    var message = this.hl7parser.create(msgg);
    var msgID = message.get("MSH.7").toString();
    this.hl7ACK(msgID);
    console.log(message);

    console.log("==== ENDING ====");

    var order: any = {};
    let r: any = {};    

    // order.orderID = r.sampleID;
    // order.testID = r.sampleID;
    // order.testType = r.testName;
    // order.testUnit = r.unit;
    // //order.createdDate = '';
    // order.results = r.result;
    // order.testedBy = r.operator;
    // order.resultStatus = 1;
    // order.analysedDateTime = r.timestamp;
    // order.specimenDateTime = r.specimenDate;
    // order.authorisedDateTime = r.timestamp;
    // order.resultAcceptedDateTime = r.timestamp;
    // order.testLocation = this.settings.labName;
    // order.machineUsed = this.settings.rocheMachine;    
  }

  handleTCPServerResponse(server, data, format) {
    if (format === 'hl7') {
      this.parseHl7Result(data);
    }
  }


  handleTCPClientResponse(client, data) {

    var d = data.toString("hex");

    if (d === "04") {
      client.write(this.ACK);
      console.log("Cobas EOT", this.strData);
      // if (this.settings.rocheConnectionType == 'tcpclient') {
      //   this.processClientData(this.strData);
      // } else {
      //   this.processServerData(this.strData);
      // }
      this.processClientData(this.strData);
      this.strData = "";
    } else if (d == "21") {
      client.write(this.ACK);
      console.log('NAK Received');
    } else {
      let text = this.hex2ascii(d);

      if (d === "02") text = "<STX>";
      if (d === "17") text = "<ETB>";
      if (d === "0D") text = "<CR>";
      if (d === "0A") text = "<LF>";
      if (d === "03") text = "<ETX>";
      if (d == "5E") text = "::";
      this.strData += text;
      console.log("Cobas_ACK_PPROCESS", this.strData);
      client.write(this.ACK);
    }

  }

  formatRawDate(rawDate) {
    let d = rawDate;
    if (rawDate != null) {
      let len = rawDate.length;

      let year = rawDate.substring(0, 4);
      let month = rawDate.substring(4, 6);
      let day = rawDate.substring(6, 8);
      d = year + "-" + month + "-" + day;
      if (len > 9) {
        let h = rawDate.substring(8, 10);
        let m = rawDate.substring(10, 12);
        let s = "00";
        if (len > 11)
          s = rawDate.substring(12, 14);
        d += " " + h + ":" + m + ":" + s;
      }

    }
    return d;
  }

  processClientData(t) {
    //  console.log(t);
    var order: any = {};
    let sp = t.split("R|1|");
    let r: any = {};
    let s = [];
    let u = [];
    if (sp[1]) {
      var sd = "1|" + sp[1];
      var ss = sp[0];
      console.log("SS " + ss);
      ss = ss.replace(/\u001707\r\n\u000221/g, "")
        .replace(/\r\n/g, "").replace(/\rC/g, "")
        .replace(/\u001767\u0002237/g, "")
        .replace(/\u0003BD/g, "").replace(/\u000309/g, "");
      sd = sd.replace(/\u001707\r\n\u000221/g, "").replace(/\r\n/g, "").replace("\rC", "").replace(/\u001767\u0002237/g, "")
        .replace(/\u0003BD/g, "").replace(/\u000309/g, "");
      s = sd.split("|");
      u = ss.split("|");
      // console.log(s);
      var l = s.length;
      r.leng = s.length;
      if (u[16]) r.lotNo = u[16];
      if (u[17]) {
        r.sampleID = u[17]; r.sampleID17 = u[17]
      };
      if (u[20]) r.orderDate = this.formatRawDate(u[20]);
      if (!r.sampleID && u[32]) r.lotNo = u[32];
      if (!r.sampleID && u[33]) r.sampleID = u[33];

      if (!r.orderDate && u[36]) r.orderDate = this.formatRawDate(u[36]);

      if (s[1]) r.test = s[1];
      if (s[2]) r.results = s[2];
      if (s[3]) r.unit = s[3];
      if (s[9]) r.operator = s[9];
      if (s[10]) r.timestamp2 = s[10];
      if (s[11]) r.timestamp = s[11];
      if (r.timestamp2) {
        if (r.timestamp2.length === 14) r.timestamp = r.timestamp2;
      }
      r.timestamp = this.formatRawDate(r.timestamp);
      // if(s[l-2]) r.sampleID=s[l-2];
      if (s[12]) r.machine = s[12];
      if (s[15]) r.status = s[15];

      let orderlog = [];
      orderlog.push(r.operator);
      orderlog.push(r.unit);
      orderlog.push(r.results);
      orderlog.push(r.timestamp);
      orderlog.push(r.orderDate);
      orderlog.push(r.timestamp);
      orderlog.push(this.settings.rocheMachine);
      orderlog.push(this.settings.labName);
      orderlog.push(0);
      orderlog.push(r.sampleID);
      orderlog.push(r.test);
      orderlog.push(r.lotNo);

      order.orderID = r.sampleID;
      order.testID = r.sampleID;
      order.testType = r.testName;
      order.testUnit = r.unit;
      //order.createdDate = '';
      order.results = r.result;
      order.testedBy = r.operator;
      order.resultStatus = 1;
      order.analysedDateTime = r.timestamp;
      order.specimenDateTime = r.specimenDate;
      order.authorisedDateTime = r.timestamp;
      order.resultAcceptedDateTime = r.timestamp;
      order.testLocation = this.settings.labName;
      order.machineUsed = this.settings.rocheMachine;

      if (order.results) {
        console.log("PROCCEES FEEDcobas", JSON.stringify(order));
        this.orderModel.addOrderTestLog(orderlog, (res) => {
          console.log("cobas processAddResult Log ", "Result Log Succesfully Added : " + r.sampleID);
        }, (err) => {
          console.log("cobas processAddResult Log ", JSON.stringify(err), "error");
        });
        this.orderModel.addOrderTest(order, (res) => {
          console.log("cobas processAddResult", "Result Successfully Added : " + r.sampleID);
        }, (err) => {
          console.log("cobas processAddResult", JSON.stringify(err), "error");
        });
      }
    }
    //console.log(r);
    return r;
  }



  processServerData(t) {
    var sp = t.split("O|1|");
    var dd: any = {};
    var order: any = {};
    var out = [], resIn = [], resLog = [];
    var speDate = "", analysDate = "", acceptDate = "";
    for (var i = 0; i < sp.length; i++) {
      var v = [], orderlog = [];
      var p1 = [], p2 = [], sa = [];
      var spp = sp[i].split("R|1|");
      if (spp[0])
        p1 = spp[0].split("|");
      if (spp[1])
        p2 = spp[1].split("|");
      //get sample ID
      if (p1[0])
        sa = p1[0].split("^");
      if (sa[0])
        dd.sampleID = sa[0];
      if (p1[5] && p1[5].length == 14) speDate = this.formatRawDate(p1[5]);
      if (p2[9] && p2[9].length == 14) analysDate = this.formatRawDate(p2[9]);
      if (p2[10] && p2[10].length == 14) acceptDate = this.formatRawDate(p2[10]);
      dd.specimenDate = speDate;
      dd.testName = (p2[0]) ? p2[0].replace("^^^", "") : p2[0];
      var result0 = (p2[1]) ? p2[1].replace("cp/mL", "") : p2[1];
      var result1 = parseFloat(result0);
      var result = (result1) ? result1 : result0;
      var rres = result + "";
      if (rres && rres.toLowerCase().indexOf("target") != -1) result = "Target Not Detected";
      if (rres && rres.toLowerCase().indexOf("detected") != -1) result = "Target Not Detected";

      if (rres && rres.toLowerCase().indexOf("titer") != -1) {
        if (rres && (rres.toLowerCase().indexOf("min") != -1 || rres.toLowerCase().indexOf("<") != -1)) result = "<20";
        if (rres && (rres.toLowerCase().indexOf("max") != -1 || rres.toLowerCase().indexOf(">") != -1)) result = ">10000000";
      } //result="<20";

      dd.result = result;
      dd.unit = p2[2];
      dd.flag = p2[6];
      dd.analysDate = analysDate;
      dd.acceptDate = acceptDate;
      dd.operator = p2[8];

      order.orderID = dd.sampleID;
      order.testID = dd.sampleID;
      order.testType = dd.testName;
      order.testUnit = dd.unit;
      //order.createdDate = '';
      order.results = dd.result;
      order.testedBy = dd.operator;
      order.resultStatus = 1;
      order.analysedDateTime = analysDate;
      order.specimenDateTime = dd.specimenDate;
      order.authorisedDateTime = acceptDate;
      order.resultAcceptedDateTime = acceptDate;
      order.testLocation = this.settings.labName;
      order.machineUsed = this.settings.rocheMachine;

      orderlog.push(dd.operator);
      orderlog.push(dd.unit);
      orderlog.push(dd.result);
      orderlog.push(analysDate);
      orderlog.push(dd.specimenDate);
      orderlog.push(acceptDate);
      orderlog.push(this.settings.rocheMachine);
      orderlog.push(this.settings.labName);
      orderlog.push(0);
      orderlog.push(dd.sampleID);
      orderlog.push("HIVVL");
      orderlog.push("");


      if (order.results) {
        console.log("Cobas48_results ", JSON.stringify(order));
        this.orderModel.addOrderTest(order, (res) => {
          console.log("cobas48 processAddResult: ", "Result Succesfully added :" + order.orderID);
        }, (err) => {
          console.log("cobas48 processAddResult: ", JSON.stringify(err), "error");
          //console.log("cobas48 processAddResult: ", JSON.stringify(order), "error");
        });

        this.orderModel.addOrderTestLog(orderlog, (res) => {
          console.log("Cobas48_resultLog ", JSON.stringify(orderlog));
          console.log("cobas48 processAddResultLog: ", "ResultLog Successful added: " + dd.sampleID);
        }, (err) => {

          console.log("cobas48 processAddResultLog: ", JSON.stringify(err), "error");
          //console.log("cobas48 processAddResultLog: ", JSON.stringify(orderlog), "error");
        });
      }
    }
  }


  insertData(data) {

  }

}
