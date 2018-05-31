/*
  Google best practices states that the user aught to be able to ask the bot to repeat themselves.
  Currently we do not do this!
  https://developers.google.com/actions/assistant/best-practices#let_users_replay_information

const REPEAT_PREFIX = [
    //  Create an array of repeat prefixes that can be used to acknowledge that the user asked for something to be repeated.
    'Sorry, I said ',
    'Let me repeat that. ',
];
*/

app.intent('repeat', conv => {
  /*
    Google tips:
    Create a repeat intent that listens for prompts to repeat from the user like "what?", "say that again", or "can you repeat that?".
    In the repeat intent handler, call ask() with a concatenated string of the repeat prefix and the value of conv.data.lastPrompt.
    Keep in mind that you'll have to shift any ssml opening tags if used in the last prompt.
  */

  /*
    This intent listens out for the user requesting the bot repeats the last phrase.
    Most likely audio-only (or hands-free) device usage.
  */

  const textToSpeech = conv.data.last_intent_prompt_speech;
  const textToDisplay = conv.data.last_intent_prompt_text;
  const intent_name = conv.data.last_intent_name; // Neccessary?
  const intent_context = conv.data.last_intent_context;

  if (textToSpeech && textToDisplay) {
    forward_contexts(conv, intent_name, intent_context, intent_context); // Forward the contexts onwards!

    // The required context data exists
    conv.ask(
      // We don't need anything other than simple response, as screen devices can simply scroll up to see past content.
      new SimpleResponse({
        // Sending the details to the user
        speech: textToSpeech,
        text: textToDisplay
      })
    );

    const hasScreen = conv.surface.capabilities.has('actions.capability.SCREEN_OUTPUT');
    if (intent_name === 'recommendMovie' && hasScreen){
      /*

        Let's show the carousel again so that the
      */
      conv.ask(
        new BrowseCarousel({
          items: carousel_items
        })
      );
    }
  } else {
    // No contexts were found
    conv.redirect.intent('handle_no_contexts'); // Redirect to 'handle_no_contexts' intent.
  }
});
