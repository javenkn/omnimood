const twit = require('twitter');
var secrets = require('./json/secret.json');
var emojiList = require('./json/codeEmoji.json');
const mongoose = require('mongoose');
const Country = require('./models/countries');
const Timeline = require('./models/timeline');
const emojiValues = require('./json/emoji.json');
const bluebird = require('bluebird');
twitter = new twit(secrets[0]);
var tweetUpdate ={};
var tweets = [];
var tweetCount = 15;
module.exports = {};
var twitterStream;
var argCount = 0;
var countEmoji = {};
twitter.stream('statuses/filter', {'locations':'-180,-90,180,90'}, function (stream) {
  twitterStream = stream;
  twitterStream.on(('data'), function (tweet) {
    var tweetObj = getVariables(tweet);
    if(tweetObj) {
      if(tweet.place && tweet.place.country){
        parseTweet(tweets, tweetObj.emojis, tweetObj.coordinates, tweetObj.date, tweet, tweetObj.codeTweets, emojiList, tweetUpdate);
      }
    }
  });
});

function getVariables(tweet) {
  if(tweet.coordinates) {
    if(tweet.coordinates !== null) {
      var coordinates = {lat: tweet.coordinates.coordinates[1], long: tweet.coordinates.coordinates[0]};
      var date = new Date(parseInt(tweet.timestamp_ms)).toLocaleString();
      var codeTweets = {};
      var emojis = getEmoji(tweet);
      if(emojis) {
        return {
          coordinates: coordinates,
          date: date,
          codeTweets: codeTweets,
          emojis: emojis
        };
      }
    }
  }
}

function listenForTweets(socket) {
  socket.on('start tweets', () => {
    twitterStream.on(('data'), function (tweet) {
      var tweetObj = getVariables(tweet);
      if(tweetObj) {
        if(tweetObj.emojis) {
          var tweetMoodValue = calculateTweetMood(tweetObj.emojis);
          socket.emit('tweet', {
            emojis: tweetObj.emojis,
            coordinates: tweetObj.coordinates,
            moodValue: tweetMoodValue
          });
        }
      }
    });

    twitterStream.on('error', function (error) {
      throw error;
    });
  });

}

function getEmoji(tweet) {
  var ranges = [
    '\ud83c[\udf00-\udfff]',
    '\ud83d[\udc00-\ude4f]',
    '\ud83d[\ude80-\udeff]'
  ];
  var text = tweet.text;
  var emojis = text.match(new RegExp(ranges.join('|'), 'g'));
  return emojis;
}

function parseTweet(tweetArr, emojis, coordinates, date, tweet, codeTweets, emojiList, tweetUpdate) {
  tweetArr.push(
    {
      emojis: emojis,
      coordinates: coordinates,
      date: date,
      type: tweet.coordinates.type,
      place: tweet.place.name,
      country_code: tweet.place.country_code,
      country: tweet.place.country
    }
  );
  var amount = 0;
  var negativeEmojis = 0;
  var neutralEmojis = 0;
  var positiveEmojis = 0;
  var surrogate = emojis.map((emoji) => {
    return '\\u' + emoji.charCodeAt(0).toString(16).toUpperCase() + '\\u' + emoji.charCodeAt(1).toString(16).toUpperCase();
  });
  surrogate.forEach((surrogate) => {
    if(emojiList[surrogate]){
      var emojiName = codeTweets[emojiList[surrogate].name]
      if(emojiName){
        codeTweets[emojiList[surrogate].name] =  codeTweets[emojiList[surrogate].name] + 1;
      }
      else{
        amount += 1;
        codeTweets[emojiList[surrogate].name] = 1;
      }
      if(emojiList[surrogate].value === 1){
        positiveEmojis++;
      }
      else if(emojiList[surrogate].value === 0){
        neutralEmojis++;
      }
      else{
        negativeEmojis++;
      }
      if(countEmoji[emojiList[surrogate].code]){
        countEmoji[emojiList[surrogate].code] ++;
      }
      else{
        countEmoji[emojiList[surrogate].code] = 1;
      }
      argCount++;
    }
    var surrogatePair = surrogate.split('\\u').slice(1);
    var code = '0x';
  });
  if(Object.keys(codeTweets).length!== 0){
    if(tweetUpdate[tweet.place.country]){
      for(var pairs in codeTweets){
        var updateCountry = tweetUpdate[tweet.place.country];
        if(updateCountry[pairs])
          updateCountry[pairs] += codeTweets[pairs];
        else{
          updateCountry[pairs] = 1;
        }
      }
      tweetUpdate[tweet.place.country].amount += amount;
      tweetUpdate[tweet.place.country].negativeEmojis += negativeEmojis;
      tweetUpdate[tweet.place.country].positiveEmojis += positiveEmojis;
      tweetUpdate[tweet.place.country].neutralEmojis += neutralEmojis;
    }
    else{
      tweetUpdate[tweet.place.country] = codeTweets;
      tweetUpdate[tweet.place.country].amount = amount;
      tweetUpdate[tweet.place.country].negativeEmojis = negativeEmojis;
      tweetUpdate[tweet.place.country].positiveEmojis = positiveEmojis;
      tweetUpdate[tweet.place.country].neutralEmojis = neutralEmojis;
    }
    tweetCount -= 1;
    if(tweetCount === 0){
      tweetCount = 15;
      livingDatabase(tweetUpdate, countEmoji,argCount);
      argCount = 0;
      countEmoji = {};
      tweetUpdate = {};
    }
  }
}

function calculateTweetMood (emojis) {
  var total = 0;
  var surrogate = emojis.map((emoji) => {
    return '\\u' + emoji.charCodeAt(0).toString(16).toUpperCase() + '\\u' + emoji.charCodeAt(1).toString(16).toUpperCase();
  });
  surrogate.forEach(function (surrogate) {
    if(emojiList[surrogate]){
      total += emojiList[surrogate].value;
    }
  });
  var moodValue = total/emojis.length;
  return moodValue;
}

function calculateMood (countryEmojis) {
  var total = countryEmojis.positiveEmojis + countryEmojis.negativeEmojis + countryEmojis.neutralEmojis;
  var sum = countryEmojis.positiveEmojis - countryEmojis.negativeEmojis;
  var moodValue = sum / total;
  return moodValue;
}

function livingDatabase(tweetUpdate, countEmoji, argCount){
  Timeline.findOne({}).then((data)=>{
    var totalCount = data.totalCount;
    totalCount.total += argCount;
    for(var add in countEmoji){
      totalCount[add].count +=  countEmoji[add];
      totalCount[add].percentage = Math.round(100 *(totalCount[add].count/totalCount.total))/100;
      if(totalCount[add].count > 0 && totalCount[add].percentage === 0)
        totalCount[add].percentage = 0.01;
    }
    data.totalCount = totalCount;
    data.markModified('totalCount');
    data.save().then(()=>{
      for(var countries in tweetUpdate){
        Country.findOne({name: countries})
        .then(function(country) {
          if(country)
            var emojiData = country.emoji;
            var countryData = tweetUpdate[country.name];
          for(var emojis in countryData){
            emojiData[emojis] += countryData[emojis];
          }
          country.mood = calculateMood(emojiData);
          country.emoji = emojiData;
          country.markModified('emoji');
          country.save();
        });
      }
    });
  });
}

module.exports.listenForTweets = listenForTweets;