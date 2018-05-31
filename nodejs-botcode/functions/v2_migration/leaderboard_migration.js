
app.intent('getLeaderboard', (conv)) = {

  const intent_fallback_messages = [
    "Sorry, what do you want to do next?",
    "I didn't catch that. Do you want A, B or C?",
    "I'm having difficulties understanding what you want to do with Vote Goat. Do you want A, B or C?"
  ];

  const qs_input = {
    //  HUG REST GET request parameters
    gg_id: userId, // Anonymous google id
    api_key: 'API_KEY'
  };

  return hug_request('HUG', 'get_user_ranking', 'GET', qs_input)
  .then(body => {
    const hasScreen = conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT');

    if (body.success === true && body.valid_key === true) {

      var textToSpeech;
      var displayText;

      if (body.total_movie_votes > 0) {
        textToSpeech = `<speak>` +
          `You're currently ranked <say-as interpret-as="ordinal">${body.movie_leaderboard_ranking}</say-as> out of ${body.quantity_users} users! <break time="0.5s" /> ` +
          `You've rated ${body.total_movie_votes} movies in total, of which ${body.total_movie_upvotes} were upvotes and ${body.total_movie_downvotes} were downvotes! <break time="1.5s" /> ` +
          `What do you want to do next? Rank Movies, or get a Movie Recommendation? <break time="0.25s" /> ` +
          `</speak>`;
      } else {
        textToSpeech = `<speak>` +
          `You've yet to rank any movies; please rank some movies, the more you vote the better the movie recommendations we can create. ` +
          `What do you want to do next? Rank Movies, or get help using Vote Goat? <break time="0.25s" /> ` +
          `</speak>`;
      }

      textToDisplay = `You're currently ranked ${body.movie_leaderboard_ranking} out of ${body.quantity_users} users! \n\n ` +
        `You've rated ${body.total_movie_votes} movies in total, of which ${body.total_movie_upvotes} were upvotes and ${body.total_movie_downvotes} were downvotes! \n\n ` +
        `What do you want to do next? Rank Movies, or get a Movie Recommendation?`;

      conv.ask(
        new SimpleResponse({
          // Sending the details to the user
          speech: textToSpeech,
          text: textToDisplay
        })
      );

      if (hasScreen === true) {
        conv.ask(
          new BasicCard({
            title: `You're rank ${body.movie_leaderboard_ranking} out of ${body.quantity_users} users!`,
            text: `🗳 Keep ranking movies to improve your leaderboard position! Note that 30 days of inactivity will wipe your statistics!`,
            /*buttons: new Button({
              title: `🍿 Share user ranking`,
              url: ``,
            }),
            image: { // Mostly, you can provide just the raw API objects
              url: `${movie_element.poster_url}`,
              accessibilityText: `${movie_element.title}`,
            },*/
            display: 'WHITE'
          }),
          new Suggestions('🗳 Rank Movies', '🤔 Movie Recommendations', '📑 Help', '🚪 quit')
        );
      }

    } else {
      // Something wrong with the hug function..
      return catch_error(conv, 'Unexpected error!', 'getLeaderBoards');
    }

  })
  .catch(error_message => {
    return catch_error(conv, error_message, 'training');
  });
}
