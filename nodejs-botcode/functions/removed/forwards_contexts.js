function forward_contexts (conv, intent_name, inbound_context_name, outbound_context_name) {
  /*
    A function for easily forwarding the contents of contexts!
    Why? Helper intents help direct conversations & need to forwards the user to the corrent intended intent after error handling!
    Which intents? Voting, Repeat, Carousel? Several -> Keep it general!
  */

  return new Promise((resolve, reject) => {
    // Do async job
    console.log(`forward_context pre triggered! ${conv.contexts.get(inbound_context_name).parameters}`);
    if (typeof(conv.contexts.get(inbound_context_name)) !== "undefined") {
      /*
        The inbound context exists.
        Let's forwards it on!
      */
      console.log(`Forwarded contexts! Inbound: '${inbound_context_name}', Outbound: '${outbound_context_name}. CONTENTS BEFORE: ${conv.contexts.get(inbound_context_name).parameters}'`);
      conv.contexts.set(outbound_context_name, 1, conv.contexts.get(inbound_context_name).parameters);
      console.log(`CONTENTS AFTERWARDS FORWARD: ${conv.contexts.get(outbound_context_name).parameters}`);
      resolve('Success!');
    } else {
      /*
        We tried to forward the contents of a context which did not exist.
      */
      console.error(`ERROR: Failed to forwards the inbound context named "${inbound_context_name}"`);
      reject('Failure');
    }
  });
}
