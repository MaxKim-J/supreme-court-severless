class Firebase {
  constructor(admin) {
    this.admin = admin
  }

  initializeApp() {
    this.admin.initializeApp({
      credential: this.admin.credential.applicationDefault(),
      databaseURL: 'https://supreme-court-tweet-bot-63f82.firebaseio.com/'
    });
  }

  async getCountsFromDB() {
    const counts = await this.admin.database().ref('/precedent/counts').once('value')
    return counts.val()
  }

  async updateCountsToDB(counts) {
    await this.admin
      .database()
      .ref("/precedent")
      .set({ counts });
  }
}

module.exports = Firebase
