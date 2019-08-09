/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

let EXPORTED_SYMBOLS = ["ReplyManagerUtils"];

const Cu = Components.utils;
const Cc = Components.classes;
const Ci = Components.interfaces;

Cu.import("resource:///modules/gloda/public.js");
Cu.import("resource://replymanager/modules/replyManagerCalendar.jsm");
Cu.import("resource:///modules/mailServices.js");
Cu.import("resource:///modules/gloda/index_msg.js");
Cu.import("resource:///modules/StringBundle.js");
Cu.import("resource://gre/modules/Preferences.jsm");
try {
  Cu.import("resource://calendar/modules/calUtils.jsm");
} catch(e) {}

let ReplyManagerUtils = {
  CcBccSettingChanged: false,
  /**
   * Get the list of email addresses who have not replied to the message
   * @param aGlodaMsg
   * @param callback function: receiving four arguments - aGlodaMsg, aCollection
   *                           and recipients array.
   * a recipient is an object with the following member attributes:
   *    1. address: the mailbox address of the recipient without the name
   *    2. didReply: true if the recipients has replied.
   */
  getNotRepliedForGlodaMsg: function (aGlodaMsg, callback) {
    aGlodaMsg.conversation.getMessagesCollection({
      onItemsAdded: function() {},
      onItemsModified: function() {},
      onItemsRemoved: function() {},
      onQueryCompleted: function(aCollection) {
        // The constructor for the recipient object described above
        function recipient(aAddress, aDidReply) {
          this.address = aAddress;
          this.didReply = aDidReply;
        }

        let recipients = [];
        // ccList and bccList will help us identify cc and bcc mailboxes so that we can filter them out if necessary
        let ccList = {};
        let bccList = {};
        let getList = function(aList) {
          let rvList = {};
          for (let address in aList) {
            let addressValue = address.value;
            rvList[addressValue] = true;
          }
          return rvList;
        }
        ccList = getList(aGlodaMsg.cc);
        bccList = getList(aGlodaMsg.bcc);

        let includeCC = Preferences.get("extensions.replymanager.includecc", true);
        let includeBCC = Preferences.get("extensions.replymanager.includebcc", true);
        let counter = 0;
        for (let i = 0; i < aGlodaMsg.recipients.length; ++i) {
          let address = aGlodaMsg.recipients[i].value;
          if (!(ccList[address] && !includeCC) && !(bccList[address] && !includeBCC)) {
            let didReply = aCollection.items.some(function(aItem) aItem.from.value == address);
            recipients[counter++] = new recipient(address, didReply);
          }
        }

        callback(aGlodaMsg, aCollection, recipients);
      }
    });
  },

  /**
   * getNotRepliedForHdr
   * @param aMsgHdr
   * @param callback function
   * The strategy is that we get the gloda message first then query the gloda database from that
   * message.
   */
  getNotRepliedForHdr: function ReplyManagerUtils_getNotRepliedForHdr(aMsgHdr, callback)
  {
    Gloda.getMessageCollectionForHeader(aMsgHdr, {
      onItemsAdded: function() {},
      onItemsModified: function() {},
      onItemsRemoved: function() {},
      onQueryCompleted: function(aCollection) {
        //We need to ensure that the message has been indexed
        if (aCollection.items.length > 0) {
          ReplyManagerUtils.getNotRepliedForGlodaMsg.call(this, aCollection.items[0], callback);
        } else {
          throw new Error("Reply Manager Error: Message not found in Gloda database");
        }
      }
    });
  },

  /**
   * Set ExpectReply flag to true and set the ExpectReplyDate property.
   * If the flag is already true, modify the ExpectReplyDate property.
   */
  setExpectReplyForHdr: function ReplyManagerUtils_setExpectReplyForHdr(aMsgHdr, aDateStr)
  {
    markHdrExpectReply(aMsgHdr, true, aDateStr);

    if (Preferences.get("extensions.replymanager.create_calendar_event_enabled", false))
      ReplyManagerUtils.addHdrToCalendar(aMsgHdr);
  },

  /**
   * Reset ExpectReply flag.
   * We don't need to modify the ExpectReplyDate property because they will be set when we set the
   * flag again.
   */
  resetExpectReplyForHdr: function ReplyManagerUtils_resetExpectReplyForHdr(aMsgHdr)
  {
    markHdrExpectReply(aMsgHdr, false);

    // We should attempt to remove the event regardless of the preference because an event might be
    // created before the preference was set to false.
    ReplyManagerUtils.removeHdrFromCalendar(aMsgHdr);
  },

  /**
   * updateExpectReplyForHdr updates the Expect Reply date and the associated
   * calendar event if the feature is enabled
   * @param aMsgHdr
   * @param aDateStr is an optional parameter that, when specified, will
   *        change the expect reply date. If not this method will only
   *        attempt to modify the calendar event's title.
   */
  updateExpectReplyForHdr: function ReplyManagerUtils_updateExpectReplyForHdr(aMsgHdr, aDateStr) {
    let callback = function (aGlodaMessage, aCollection, aRecipientsList) {
      let replyManagerStrings = new StringBundle("chrome://replymanager/locale/replyManager.properties");
      let subject = aGlodaMessage.folderMessage.mime2DecodedSubject;
      let recipients = getNotRepliedRecipients(aRecipientsList);
      let dateStr = (aDateStr) ? aDateStr : aMsgHdr.getStringProperty("ExpectReplyDate");
  	  // Convert to locale date string
  	  dateStr = (new Date(dateStr)).toLocaleDateString();
      let newDate = (aDateStr) ? getDateForICalString(aDateStr)
                               : null;

      // When all people have replied to our email, the recipients will be an empty string.
      // In that case we need to give the event a more meaningful title.
      let newStatus = (recipients == "") ?
                      "\"" + subject + "\" : " + replyManagerStrings.getString("AllReplied") :
                      "\"" + subject + "\" : " + replyManagerStrings.getString("NotAllReplied") + " "
                      + recipients + " " + replyManagerStrings.getString("DeadlineForReplies") +  " " + dateStr;
      ReplyManagerCalendar.modifyCalendarEvent(aMsgHdr.messageId, newStatus, newDate);
    }
    if (aDateStr) {
      aMsgHdr.setStringProperty("ExpectReplyDate", aDateStr);
    }
    if (Preferences.get("extensions.replymanager.create_calendar_event_enabled", false))
      ReplyManagerUtils.getNotRepliedForHdr(aMsgHdr, callback);
  },

  /**
   * test if this message is expecting replies
   * @param aMsgHdr is an nsIMsgDBHdr object
   */
  isHdrExpectReply: function ReplyManagerUtils_isHdrExpectReply(aMsgHdr) {
    return aMsgHdr.getStringProperty("ExpectReply") == "true";
  },

  /**
   * Add this expect reply entry to calendar
   * @param aMsgHdr is the message header associated with this event
   */
  addHdrToCalendar: function ReplyManagerUtils_addHdrToCalendar(aMsgHdr) {
    let replyManagerStrings = new StringBundle("chrome://replymanager/locale/replyManager.properties");
    let headerParser = MailServices.headerParser;
    // We need to merge the three fields and remove duplicates.
    // To make it simpler, we use set.
    let recipients = new Set();
    let mergeFunction = function (addressStr) {
      if (addressStr != "") {
        let addressListObj = {};
        headerParser.parseHeadersWithArray(addressStr, addressListObj, {}, {});
        for (let recipient of addressListObj.value) {
          //Let's add the address to the recipients set
          recipients.add(recipient);
        }
      }
    };
    mergeFunction(aMsgHdr.recipients);
    if (Preferences.get("extensions.replymanager.includecc", true)) {
      mergeFunction(aMsgHdr.ccList);
    }
    if (Preferences.get("extensions.replymanager.includebcc", true)) {
      mergeFunction(aMsgHdr.bccList);
    }
    let finalRecipients = Array.from(recipients.values()).join(", ");

    // If we initialized using a whole date string, the date will be 1 less
    // than the real value so we need to separate the values.
    let dateStr = aMsgHdr.getStringProperty("ExpectReplyDate");
	// Convert to locale date string
	localeDateStr = (new Date(dateStr)).toLocaleDateString();
    let date = getDateForICalString(dateStr);
    let status = "\"" + aMsgHdr.mime2DecodedSubject + "\" " + replyManagerStrings.getString("NotAllReplied") + " "
                      + finalRecipients + " " + replyManagerStrings.getString("DeadlineForReplies") +  " " + localeDateStr;
    ReplyManagerCalendar.addEvent(date, aMsgHdr.messageId, status);
  },

  removeHdrFromCalendar: function ReplyManagerUtils_removeHdrFromCalendar(aMsgHdr) {
    ReplyManagerCalendar.removeEvent(aMsgHdr.messageId);
  },

  startReminderComposeForHdr: function ReplyManagerUtils_startReminderCompose(aMsgHdr) {
    ReplyManagerUtils.getNotRepliedForHdr(aMsgHdr, ReplyManagerUtils.openComposeWindow);
  },

  openComposeWindow: function ReplyManagerUtils_openComposeWindow(aGlodaMsg, aCollection, aRecipientsList) {
    let recipients = getNotRepliedRecipients(aRecipientsList);
    let boilerplate = Preferences.get("extensions.replymanager.boilerplate");

    cal.sendMailTo(recipients, aGlodaMsg.subject, boilerplate);
  }
};

/**
 * Mark the given header as expecting reply
 * @param aMsgHdr is an nsIMsgDBHdr
 * @param aExpectReply is the boolean value indicating whether
 *        the message is expecting replies
 * @param aDate is the expect reply date. It must be provided if
 *        aExpectReply is true
 */
function markHdrExpectReply(aMsgHdr, aExpectReply, aDate) {
  let database = aMsgHdr.folder.msgDatabase;
  if (aExpectReply && aDate == null)
    throw new Error("Error: a date must be provided if aExpectReply is true");
  if (aMsgHdr.folder instanceof Ci.nsIMsgImapMailFolder) {
    database.setAttributeOnPendingHdr(aMsgHdr, "ExpectReply", aExpectReply);
    if (aExpectReply)
      database.setAttributeOnPendingHdr(aMsgHdr, "ExpectReplyDate", aDate);
  }
  aMsgHdr.setStringProperty("ExpectReply", aExpectReply);
  if (aExpectReply)
    aMsgHdr.setStringProperty("ExpectReplyDate", aDate);

  // We need to re-index this message to reflect the change to the Gloda attribute
  indexMessage(aMsgHdr);
}

/**
 * Tell Gloda to reindex the message to make queries return the correct collections
 */
function indexMessage(aMsgHdr) {
  if (Gloda.isMessageIndexed(aMsgHdr)) {
    //the message is already indexed we just need to reindex it
    GlodaMsgIndexer._reindexChangedMessages([aMsgHdr], true);
  } else {
    GlodaMsgIndexer.indexMessages([[aMsgHdr.folder, aMsgHdr.messageKey]]);
  }
}

function getNotRepliedRecipients(aRecipientsList) {
  let recipients = [];

  for (let [i, recipient] in Iterator(aRecipientsList)) {
    if (!recipient.didReply) {
      recipients.push(recipient.address);
    }
  }

  return recipients.join(", ");
}

//Remove the '-' in the date string to get a date string used by iCalString
function getDateForICalString(aDateStr) {
  let year = aDateStr.substr(0, 4);
  let month = aDateStr.substr(5, 2);
  let date = aDateStr.substr(8, 2);
  return year + month + date;
}

/**
 * Gloda attribute provider
 * the isExpectReply attribute of the message header is contributed to
 * Gloda so that we can query messages marked isExpectReply. I need to
 * get a collection of such messages to display them collectively.
 */
let isExpectReply = {

  init: function() {
    this.defineAttribute();
  },

  defineAttribute: function() {
    this._attrIsExpectReply = Gloda.defineAttribute({
      provider: this,
      extensionName: "replyManager",
      attributeType: Gloda.kAttrExplicit,
      attributeName: "isExpectReply",
      bind: true,
      singular: true,
      canQuery: true,
      subjectNouns: [Gloda.NOUN_MESSAGE],
      objectNoun: Gloda.NOUN_BOOLEAN,
      parameterNoun: null,
    });
  },

  process: function* (aGlodaMessage, aRawReps, aIsNew, aCallbackHandle) {
    aGlodaMessage.isExpectReply =
           ReplyManagerUtils.isHdrExpectReply(aRawReps.header);
    yield Gloda.kWorkDone;
  }
};
isExpectReply.init();
