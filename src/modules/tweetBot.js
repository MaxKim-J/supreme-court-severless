const Twitter = require('twitter')
const supremeCourtApi = require('../services')


class TweetBot {
  constructor() {
    this.client = new Twitter({
      consumer_key: process.env.CONSUMER_KEY,
      consumer_secret: process.env.CONSUMER_KEY_SECRET,
      access_token_key: process.env.ACCESS_TOKEN_KEY,
      access_token_secret: process.env.ACCESS_TOKEN_SECRET
    });
  }

  async getCurrentTweet() {
    const {data:{tweet}} = await supremeCourtApi.get('/tweet/current')
    const {id, precedent:{name}} = tweet
    return {id,name}
  }

  async putTweetTimeStamp(id) {
    const {data:{tweet:{uploadedAt}}} = await supremeCourtApi.put(`/tweet/${id}`)
    return uploadedAt
  }

  postTweet(id,name) {
    this.client.post('statuses/update', {
      status:`${name}\nhttps://tweet-bot-client.vercel.app/detail/${id}`
    },(err,data,response) => {
      if(err) {throw err}
      return data.text
    })
  }
}

module.exports = TweetBot
