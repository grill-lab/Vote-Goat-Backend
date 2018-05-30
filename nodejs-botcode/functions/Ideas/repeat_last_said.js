/*
  Google best practices states that the user aught to be able to ask the bot to repeat themselves.
  Currently we do not do this!
  https://developers.google.com/actions/assistant/best-practices#let_users_replay_information
*/
/*
const REPEAT_PREFIX = [
    //  Create an array of repeat prefixes that can be used to acknowledge that the user asked for something to be repeated.
    'Sorry, I said ',
    'Let me repeat that. ',
];

function ask(conv, inputPrompt) {
  // Wrap all your app.ask(output) methods with a proxy function that adds the output to conv.data.lastPrompt.
  conv.data.lastPrompt = inputPrompt;
  conv.ask(inputPrompt);
}

// Intent handlers

function normalIntent(conv) {
  // Example intent
  ask(conv, 'Hey this is a question');
}
*/

function repeat(conv) {
  /*
    Create a repeat intent that listens for prompts to repeat from the user like "what?", "say that again", or "can you repeat that?".
    In the repeat intent handler, call ask() with a concatenated string of the repeat prefix and the value of conv.data.lastPrompt.
    Keep in mind that you'll have to shift any ssml opening tags if used in the last prompt.
  */
  // TODO: Get context contents: Intent name, last prompt, fallback prompts?
  // TODO: Storing data in 'repeat' context? Or entirely within the conv.data storage?

  if (conv.data.last_intent_prompt_speech && conv.data.last_intent_prompt_text) {
    //
    const textToSpeech = conv.data.last_intent_prompt_speech;
    const textToDisplay = conv.data.last_intent_prompt_text;

    conv.ask(
      // We don't need anything other than simple response, as screen devices can simply scroll up to see past content.
      new SimpleResponse({
        // Sending the details to the user
        speech: textToSpeech,
        text: textToDisplay
      })
    );
  }

  // TODO: Forwards the previous intent's context contents to the next intent!
  // Why: To trigger the

}

/*
  RICKY NOTE:
  We don't need to resend the
  We could just store the simple response contents
*/
