function listFallback(app) {
  /*
  Fallback function for the voting mechanisms!
  Change the CAROUSEL_FALLBACK contents if you want different responses.
  */
  console.log("RECOMMEND FALLBACK TRIGGERED!");
  const recommendation_context = conv.contexts.get('recommend_movie_context');
  const list_body = conv.contexts.get('list_body');

  if (recommendation_context['placeholder'] && list_body['0']) {
    let carousel = recommendation_context['repeatedCarousel'].value;

    let first_movie = list_body['0'].value; // Grabbing the first movie_element
    let second_movie = list_body['1'].value; // Grabbing the second movie_element
    let third_movie = list_body['2'].value; // Grabbing the third movie_element

    var CAROUSEL_FALLBACK_DATA;
    if (hasScreen === true) {
      CAROUSEL_FALLBACK_DATA = [
        "Sorry, which film was that?",
        "I didn't catch that. Could you repeat your movie selection?",
        "I'm having difficulties understanding your movie selection. Which movie from the list are you most interested in watching?"
      ];
    } else {
      // We need to remind users without screens what the movies were!
      CAROUSEL_FALLBACK_DATA = [
        "Sorry, which film was that?",
        `I didn't catch that. Could you repeat your movie selection?`,
        `I'm having difficulties understanding. The movies were ${first_movie.title}, ${second_movie.title} and ${third_movie.title}. Interested in any of them?`
      ];
    }
    let current_fallback_phrase = CAROUSEL_FALLBACK_DATA[conv.data.fallbackCount];

    const current_fallback_value = parseInt(conv.data.fallbackCount, 10); // Retrieve the value of the intent's fallback counter
    conv.data.fallbackCount++; // Iterate the fallback counter

    if (current_fallback_value > 3) {
      // The user failed too many times
      conv.close("Unfortunately, Vote Goat was unable to understand user input. Sorry for the inconvenience, let's try again later though? Goodbye.");
    } else {
      /*
        Displaying carousel fallback & forwarding contexts in case of subsequent carousel fallbacks
      */
      forward_contexts(conv, 'carousel_fallback', 'recommendation_context', 'recommendation_context');
      forward_contexts(conv, 'carousel_fallback', 'list_body', 'list_body');

      conv.ask(
        new SimpleResponse({
          speech: `<speak>${CAROUSEL_FALLBACK_DATA[]}</speak>`,
          text: CAROUSEL_FALLBACK_DATA[current_fallback_value]
        }),
        new BrowseCarousel({
          items: carousel_items
        })
      );
      if (conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT')) {
        conv.ask(
          new Suggestions('🗳 Rank Movies', '🏆 Show Stats', '📑 Help', `🚪 Back`)
        );
      }
    }
  } else {
    /*
      Somehow the user triggered the carousel fallback without having the carousel contexts.
     Shouldn't occur, but better safe than sorry!
    */
    conv.redirect.intent('handle_no_contexts'); // Redirect to 'handle_no_contexts' intent.
  }
}
