@hug.get(examples='conv_id=CONV_ID&conv_json=CONV_JSON&limit=10&api_key=API_KEY')
def store_conv(conv_id: hug.types.text, conv_json: hug.types.text, api_key: hug.types.text, hug_timer=5):
    """The purpose of this function is to enable logging the Dialogflow CONV object."""
    
