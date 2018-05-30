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

function repeat_response_store (conv, speech, text, intent_name, intent_context) {
  /*
    A function for easily storing the response data.
    Takes in the speech, text, intent name & list of fallback strings.
  */
  conv.data.last_intent_prompt_speech = speech;
  conv.data.last_intent_prompt_text = text;
  conv.data.last_intent_name = intent_name;
  conv.data.last_intent_context = intent_context;
}

function forward_contexts (conv, intent_name, inbound_context_name, outbound_context_name) {
  /*
    A function for easily forwarding the contents of contexts!
    Why? Helper intents help direct conversations & need to forwards the user to the corrent intended intent after error handling!
    Which intents? Voting, Repeat, Carousel? Several -> Keep it general!
  */
  const inbound_context = conv.contexts[inbound_context_name];

  if (inbound_context) {
    /*
      The inbound context exists.
      Let's forwards it on!
    */
    conv.contexts.set(outbound_context_name, 1, inbound_context);
    console.log(`WELCOME CONTEXT PRESENT! ${conv.contexts.Welcome}`);
  } else {
    /*
      We tried to forward the contents of a context which did not exist.
    */
    console.log(`ERROR: Failed to forwards the inbound context named "${inbound_context_name}"`);
    conv.redirect.intent('handle_no_contexts'); // Redirect to 'handle_no_contexts' intent.
  }
}

app.intent('repeat', conv => {
  /*
    Create a repeat intent that listens for prompts to repeat from the user like "what?", "say that again", or "can you repeat that?".
    In the repeat intent handler, call ask() with a concatenated string of the repeat prefix and the value of conv.data.lastPrompt.
    Keep in mind that you'll have to shift any ssml opening tags if used in the last prompt.
  */
  // TODO: Get context contents: Intent name, last prompt, fallback prompts?
  // TODO: Storing data in 'repeat' context? Or entirely within the conv.data storage?

  const textToSpeech = conv.data.last_intent_prompt_speech;
  const textToDisplay = conv.data.last_intent_prompt_text;
  const intent_name = conv.data.last_intent_name; // Neccessary?
  const intent_context = conv.data.last_intent_context;

  if (conv.data.last_intent_prompt_speech && conv.data.last_intent_prompt_text) {

    conv.ask(
      // We don't need anything other than simple response, as screen devices can simply scroll up to see past content.
      new SimpleResponse({
        // Sending the details to the user
        speech: textToSpeech,
        text: textToDisplay
      })
    );
  } else {
    // No contexts were found
    conv.redirect.intent('handle_no_contexts'); // Redirect to 'handle_no_contexts' intent.
  }

  forward_contexts(conv, intent_name, intent_context, intent_context); // Forward the contexts onwards!
}

/*
  RICKY NOTE:
  We don't need to resend the
  We could just store the simple response contents
*/
