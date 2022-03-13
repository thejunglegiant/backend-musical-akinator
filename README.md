# Musical Akinator (backend)
Made by [@thejunglegiant](https://t.me/thejunglegiant) with Node.js, special for [int20h](http://int20h.best-kyiv.org/) hackathon.

Now it should be hosted on Heroku at https://muz.dkaraush.me/.

This backend app is written to serve content for [Musical Akinator frontend](https://github.com/dkaraush/musical-akinator).
## Theory
This app uses [express web framework](https://expressjs.com/) with these API's:

* [audd.io](https://audd.io/) for recognizing and searching tracks (personal api_token needed)
* [Genius API](https://docs.genius.com/) for obtaining track's info (personal api_token needed)
* [Deezer API](https://developers.deezer.com/api) also for obtaining info about tracks (no api_token)
## Installation
* Clone repo
* Run `npm install`
* Add your `settings.js` file:
  ```
  module.exports = {
    AUDD_TOKEN: 'your_token',
    GENIUS_TOKEN: 'your_token',
  };
  ```
* Deploy the server using [heroku official guide](https://devcenter.heroku.com/articles/git)
