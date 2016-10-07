console.log("It just works");

const mongoose = require('mongoose');
const MONGO_URL = 'mongodb://localhost/omnimood';
const connection = mongoose.connect(MONGO_URL);
const Country = require('./models/countries');
const fs = require('fs');
const bluebird = require('bluebird');
var dataArray = []
mongoose.connection.once('open', () => {
  Country.find({}).then((countryData)=>{
    countryData.forEach((element, index, array)=>{
      dataArray.push(element.emoji.amount);
    });
    var date = new Date();
    fs.writeFile('bitesZaDusto.json' + date, JSON.stringify(dataArray),()=>{
      console.log("Beautiful Duwang");
      mongoose.connection.close();
    });
  });
});