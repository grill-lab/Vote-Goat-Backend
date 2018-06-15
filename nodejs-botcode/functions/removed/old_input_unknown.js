app.intent('input.unknown', conv => {
  /*
  Fallback used when the Google Assistant doesn't understand which intent the user wants to go to.
  */

  //var intent_fallback_messages;
  var suggestions;

  console.log(`dots: ${conv.data.fallback_text_0}, other: ${conv.data['fallback_text_0']}, suggestions: ${conv.data.suggestions}`);

  if (conv.data.fallback_text != "") {
    //intent_fallback_messages = conv.data.fallback_text;
    const suggestion_string = conv.data.suggestions;

    console.log(`input.unknown! suggestions: ${conv.data.suggestions}`);

    if (suggestion_string != ' ') {
      // There are suggestion chips to display!
      suggestions = suggestion_string.toString().split(',');
    } else {
      suggestions = []; // No suggestion chips!
    }

  } else {
    console.log("Unknown intent fallback triggered!");

    /*
    intent_fallback_messages = [
      "Sorry, what was that?",
      "I didn't catch that. What do you want to do in Vote Goat??",
      "I'm having trouble understanding. Want to rank movies or get movie recommendations?"
    ];
    */

    suggestions = ['🗳 Rank Movies', '🤔 Movie Recommendation', '🏆 Show Stats', `🐐 GOAT Movies`, '📑 Help', `🚪 Quit`];
  }*/

  return genericFallback(conv, `bot.fallback`);
});
