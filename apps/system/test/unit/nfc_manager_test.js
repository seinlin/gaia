'use strict';

/* globals MockDOMRequest, MockNfc, MocksHelper, MozNDEFRecord, NDEF,
           NfcUtils, NfcManager, MozActivity, NfcHandoverManager */

require('/shared/test/unit/mocks/mock_moz_ndefrecord.js');
require('/shared/test/unit/mocks/mock_settings_listener.js');
require('/shared/js/nfc_utils.js');
require('/shared/test/unit/mocks/mock_event_target.js');
require('/shared/test/unit/mocks/mock_dom_request.js');
require('/test/unit/mock_screen_manager.js');
requireApp('system/test/unit/mock_activity.js');
requireApp('system/test/unit/mock_nfc.js');
requireApp('system/test/unit/mock_nfc_handover_manager.js');
requireApp('system/test/unit/mock_screen_manager.js');
requireApp('system/test/unit/mock_bluetooth.js');
require('/shared/test/unit/mocks/mock_system.js');

var mocksForNfcManager = new MocksHelper([
  'MozActivity',
  'MozNDEFRecord',
  'ScreenManager',
  'SettingsListener',
  'NfcHandoverManager',
  'System'
]).init();

var MockMessageHandlers = {};
function MockMozSetMessageHandler(event, handler) {
  MockMessageHandlers[event] = handler;
}

suite('Nfc Manager Functions', function() {

  var realMozSetMessageHandler;
  var realMozBluetooth;

  mocksForNfcManager.attachTestHelpers();

  setup(function(done) {
    realMozSetMessageHandler = window.navigator.mozSetMessageHandler;
    window.navigator.mozSetMessageHandler = MockMozSetMessageHandler;
    realMozBluetooth = window.navigator.mozBluetooth;
    window.navigator.mozBluetooth = window.MockBluetooth;

    requireApp('system/js/nfc_manager.js', done);
  });

  teardown(function() {
    window.navigator.mozSetMessageHandler = realMozSetMessageHandler;
    window.mozBluetooth = realMozBluetooth;
  });

  suite('init', function() {
    test('Message handleres for nfc-manager-tech-xxx set', function() {
      var stubHandleTechnologyDiscovered =
        this.sinon.stub(NfcManager, 'handleTechnologyDiscovered');
      var stubHandleTechLost = this.sinon.stub(NfcManager, 'handleTechLost');

      // calling init once more to register stubs as handlers
      NfcManager.init();

      MockMessageHandlers['nfc-manager-tech-discovered']();
      assert.isTrue(stubHandleTechnologyDiscovered.calledOnce);

      MockMessageHandlers['nfc-manager-tech-lost']();
      assert.isTrue(stubHandleTechLost.calledOnce);
    });

    test('NfcManager listens on screenchange, and the locking events',
    function() {
      var stubHandleEvent = this.sinon.stub(NfcManager, 'handleEvent');

      window.dispatchEvent(new CustomEvent('lockscreen-appopened'));
      assert.isTrue(stubHandleEvent.calledOnce);
      assert.equal(stubHandleEvent.getCall(0).args[0].type,
        'lockscreen-appopened');

      window.dispatchEvent(new CustomEvent('lockscreen-appclosed'));
      assert.isTrue(stubHandleEvent.calledTwice);
      assert.equal(stubHandleEvent.getCall(1).args[0].type,
        'lockscreen-appclosed');

      window.dispatchEvent(new CustomEvent('screenchange'));
      assert.isTrue(stubHandleEvent.calledThrice);
      assert.equal(stubHandleEvent.getCall(2).args[0].type, 'screenchange');
    });

    test('SettingsListner callback nfc.enabled fired', function() {
      var stubChangeHardwareState = this.sinon.stub(NfcManager,
                                               'changeHardwareState');

      window.MockSettingsListener.mCallbacks['nfc.enabled'](true);
      assert.isTrue(stubChangeHardwareState.calledOnce);
      assert.equal(stubChangeHardwareState.getCall(0).args[0],
                   NfcManager.NFC_HW_STATE_ON);

      window.MockSettingsListener.mCallbacks['nfc.enabled'](false);
      assert.isTrue(stubChangeHardwareState.calledTwice);
      assert.equal(stubChangeHardwareState.getCall(1).args[0],
                   NfcManager.NFC_HW_STATE_OFF);

      window.System.locked = true;
      window.MockSettingsListener.mCallbacks['nfc.enabled'](true);
      assert.isTrue(stubChangeHardwareState.calledThrice);
      assert.equal(stubChangeHardwareState.getCall(2).args[0],
                   NfcManager.NFC_HW_STATE_DISABLE_DISCOVERY);
      window.System.locked = false;
    });
  });

  suite('handleEvent', function() {
    test('proper handling of lock, unlock, screenchange', function() {
      var stubChangeHardwareState = this.sinon.stub(NfcManager,
                                                   'changeHardwareState');

      // screen lock when NFC ON
      NfcManager.hwState = NfcManager.NFC_HW_STATE_ON;
      window.System.locked = true;
      NfcManager.handleEvent(new CustomEvent('lockscreen-appopened'));
      assert.isTrue(stubChangeHardwareState.calledOnce);
      assert.equal(stubChangeHardwareState.getCall(0).args[0],
                   NfcManager.NFC_HW_STATE_DISABLE_DISCOVERY);

      // no change in NfcManager.hwState
      NfcManager.hwState = NfcManager.NFC_HW_STATE_DISABLE_DISCOVERY;
      NfcManager.handleEvent(new CustomEvent('screenchange'));
      assert.isTrue(stubChangeHardwareState.calledOnce);

      // screen unlock
      window.System.locked = false;
      NfcManager.handleEvent(new CustomEvent('lockscreen-appclosed'));
      assert.isTrue(stubChangeHardwareState.calledTwice);
      assert.equal(stubChangeHardwareState.getCall(1).args[0],
                   NfcManager.NFC_HW_STATE_ENABLE_DISCOVERY);

      // NFC off
      NfcManager.hwState = NfcManager.NFC_HW_STATE_OFF;
      NfcManager.handleEvent(new CustomEvent('lockscreen-appopened'));
      NfcManager.handleEvent(new CustomEvent('lockscreen-appclosed'));
      NfcManager.handleEvent(new CustomEvent('screenchange'));
      assert.isTrue(stubChangeHardwareState.calledTwice);
    });

    test('proper handling of shrinking-sent', function() {
      var stubRemoveEventListner = this.sinon.stub(window,
                                                   'removeEventListener');
      var stubDispatchEvent = this.sinon.stub(window, 'dispatchEvent');

      NfcManager.handleEvent(new CustomEvent('shrinking-sent'));

      assert.isTrue(stubRemoveEventListner.calledOnce);
      assert.equal(stubRemoveEventListner.getCall(0).args[0], 'shrinking-sent');
      assert.equal(stubRemoveEventListner.getCall(0).args[1], NfcManager);

      assert.isTrue(stubDispatchEvent.calledTwice);
      assert.equal(stubDispatchEvent.getCall(0).args[0].type,
                   'dispatch-p2p-user-response-on-active-app');
      assert.equal(stubDispatchEvent.getCall(0).args[0].detail, NfcManager);
      assert.equal(stubDispatchEvent.getCall(1).args[0].type, 'shrinking-stop');
    });
  });

  suite('handleTechnologyDiscovered', function() {
    var sampleMsg;
    var sampleURIRecord;
    var sampleMimeRecord;

    setup(function() {
      sampleMsg = {
        type: 'techDiscovered',
        techList: [],
        records: [],
        sessionToken: 'sessionToken'
      };

      // NDEF TNF well know uri unabbreviated
      sampleURIRecord = {
        tnf: NDEF.TNF_WELL_KNOWN,
        type: NDEF.RTD_URI,
        id: new Uint8Array([1]),
        payload: NfcUtils.fromUTF8('\u0000http://mozilla.org')
      };

      sampleMimeRecord = {
        tnf: NDEF.TNF_MIME_MEDIA,
        type: NfcUtils.fromUTF8('text/vcard'),
        id: new Uint8Array([2]),
        payload: NfcUtils.fromUTF8('BEGIN:VCARD\nVERSION:2.1\nN:J;\nEND:VCARD')
      };

    });

    // Helper methods, can be called multiple times in testcase, stubs and spies
    // need to be restored here.
    // invalid message test helper
    var execInvalidMessageTest = function(msg) {
      var stubVibrate = this.sinon.stub(window.navigator, 'vibrate');
      var stubDispatchEvent = this.sinon.stub(window, 'dispatchEvent');
      var stubTryHandover = this.sinon.stub(NfcHandoverManager, 'tryHandover');
      var stubFireTag = this.sinon.stub(NfcManager, 'fireTagDiscovered');
      var validMsg = {techList: [], records: []};

      NfcManager.handleTechnologyDiscovered(msg);

      assert.isTrue(stubVibrate.withArgs([25, 50, 125]).calledOnce,
                    'wrong vibrate, when msg: ' + msg);
      assert.isTrue(stubDispatchEvent.calledOnce,
                    'dispatchEvent not called once, when msg: ' + msg);
      assert.equal(stubDispatchEvent.getCall(0).args[0].type,
                   'nfc-tech-discovered',
                   'when msg ' + msg);
      assert.isTrue(stubTryHandover.withArgs(validMsg.records, undefined)
                                   .calledOnce, 'handover, when msg: ' + msg);
      assert.isTrue(stubFireTag.withArgs(validMsg, 'Unknown').calledOnce,
                    'fireTagDiscovered, when msg: ' + msg);

      stubVibrate.restore();
      stubDispatchEvent.restore();
      stubTryHandover.restore();
      stubFireTag.restore();
    };

    // fireNDEFDiscovered test helper
    var execNDEFMessageTest = function(msg, tech) {
      var stub = this.sinon.stub(NfcManager, 'fireNDEFDiscovered');

      NfcManager.handleTechnologyDiscovered(msg);
      assert.isTrue(stub.withArgs(msg, tech).calledOnce);

      stub.restore();
    };

    // fireTagDiscovered test helper
    var execTagDiscoveredTest = function(msg, tech) {
      var stub = this.sinon.stub(NfcManager, 'fireTagDiscovered');

      NfcManager.handleTechnologyDiscovered(msg);
      assert.deepEqual(stub.firstCall.args[0], msg);
      assert.equal(stub.firstCall.args[1], tech);

      stub.restore();
    };

    test('invalid message handling', function() {
      execInvalidMessageTest.call(this, null);
      execInvalidMessageTest.call(this, {});
      execInvalidMessageTest.call(this, {techList: 'invalid'});
      execInvalidMessageTest.call(this, {techList: []});
    });

    // triggering of P2P UI
    test('message tech [P2P], no records', function() {
      sampleMsg.techList.push('P2P');

      var spyTriggerP2PUI = this.sinon.spy(NfcManager, 'triggerP2PUI');
      var stubDispatchEvent = this.sinon.stub(window, 'dispatchEvent');

      NfcManager.handleTechnologyDiscovered(sampleMsg);
      assert.isTrue(spyTriggerP2PUI.calledOnce);
      assert.equal(stubDispatchEvent.secondCall.args[0].type,
                   'check-p2p-registration-for-active-app');
    });

    // P2P shared NDEF received
    test('message tech [P2P, NDEF], one record', function() {
      sampleMsg.techList.push('P2P');
      sampleMsg.techList.push('NDEF');
      sampleMsg.records.push(sampleMimeRecord);

      execNDEFMessageTest.call(this, sampleMsg, 'P2P');
    });

    test('message tech [NDEF], one URI record', function() {
      sampleMsg.techList.push('NDEF');
      sampleMsg.records.push(sampleURIRecord);

      execNDEFMessageTest.call(this, sampleMsg, 'NDEF');
    });

    // NDEF with no records was previosly treated as a special case
    // right now it is handled regularly in fireNDEFDiscovered
    test('message tech [NDEF], no records', function() {
      sampleMsg.techList.push('NDEF');

      execNDEFMessageTest.call(this, sampleMsg, 'NDEF');
    });

    // NDEF_WRITABLE is a flag which informs that it's possible to write
    // NDEF message on a tag, might have NDEF records
    test('message tech [NDEF_WRITEABLE]', function() {
      sampleMsg.techList.push('NDEF_WRITEABLE');

      execNDEFMessageTest.call(this, sampleMsg, 'NDEF_WRITEABLE');
    });

    test('message tech [NDEF_FORMATABLE]', function() {
      sampleMsg.techList.push('NDEF_FORMATABLE');
      sampleMsg.records.push = 'propriatary data';

      execTagDiscoveredTest.call(this, sampleMsg, 'NDEF_FORMATABLE');
    });

    test('message tech unsupported', function() {
      sampleMsg.techList.push('FAKE_TECH');

      execTagDiscoveredTest.call(this, sampleMsg, 'FAKE_TECH');
    });

    test('activities triggering end 2 end', function() {
      // empty record
      var empty = { tnf: NDEF.TNF_EMPTY };

      sampleMsg.techList.push('NDEF');
      sampleMsg.techList.push('NDEF_WRITEABLE');
      sampleMsg.records.push(sampleURIRecord);
      sampleMsg.records.push(empty);
      sampleMsg.records.push(sampleMimeRecord);

      this.sinon.stub(window, 'MozActivity');

      NfcManager.handleTechnologyDiscovered(sampleMsg);

      assert.deepEqual(MozActivity.firstCall.args[0], {
        name: 'nfc-ndef-discovered',
        data: {
                type: 'url',
                url: 'http://mozilla.org',
                records: sampleMsg.records,
                rtd: NDEF.RTD_URI,
                tech: 'NDEF',
                techList: sampleMsg.techList,
                sessionToken: sampleMsg.sessionToken
        }
      }, 'Uri record');

      sampleMsg.records.shift();
      NfcManager.handleTechnologyDiscovered(sampleMsg);
      assert.deepEqual(MozActivity.secondCall.args[0], {
        name: 'nfc-ndef-discovered',
        data: {
          type: 'empty',
          tech: 'NDEF',
          techList: sampleMsg.techList,
          records: sampleMsg.records,
          sessionToken: sampleMsg.sessionToken
        }
      },'TNF empty');

      sampleMsg.records.shift();
      NfcManager.handleTechnologyDiscovered(sampleMsg);
      assert.deepEqual(MozActivity.thirdCall.args[0], {
        name: 'import',
        data: {
          type: 'text/vcard',
          blob: new Blob([NfcUtils.toUTF8(sampleMsg.records.payload)],
                         {'type': 'text/vcard'}),
          tech: 'NDEF',
          techList: sampleMsg.techList,
          records: sampleMsg.records,
          sessionToken: sampleMsg.sessionToken
        }
      },'mime record');

      sampleMsg.records.shift();
      sampleMsg.techList.shift();
      NfcManager.handleTechnologyDiscovered(sampleMsg);
      assert.deepEqual(MozActivity.lastCall.args[0], {
        name: 'nfc-ndef-discovered',
        data: {
          type: 'empty',
          tech: 'NDEF_WRITEABLE',
          techList: sampleMsg.techList,
          records: sampleMsg.records,
          sessionToken: sampleMsg.sessionToken
        }
      }, 'no records');
    });
  });

  suite('fireNDEFDiscovered', function() {
    var msg;

    setup(function() {
      msg = {
        type: 'techDiscovered',
        techList: [],
        records: [],
        sessionToken: 'sessionToken'
      };
    }),

    test('Proper NDEF Message contents', function() {
      var uriRecord = {
        tnf: NDEF.TNF_WELL_KNOWN,
        type: NDEF.RTD_URI,
        id: new Uint8Array([1]),
        payload: NfcUtils.fromUTF8('\u0000http://mozilla.org')
      };
      msg.records.push(uriRecord);
      msg.techList.push('NDEF');

      this.sinon.stub(window, 'MozActivity');
      var spyHandleNdefMessage = this.sinon.spy(NfcManager,
                                                'handleNdefMessage');

      NfcManager.fireNDEFDiscovered(msg, msg.techList[0]);
      assert.isTrue(spyHandleNdefMessage.withArgs(msg.records).calledOnce);
      assert.deepEqual(MozActivity.firstCall.args[0], {
        name: 'nfc-ndef-discovered',
        data: {
                type: 'url',
                url: 'http://mozilla.org',
                records: msg.records,
                rtd: NDEF.RTD_URI,
                tech: msg.techList[0],
                techList: msg.techList,
                sessionToken: msg.sessionToken
        }
      });
    });

    test('Invalid NDEF Message contents', function() {
      msg.techList.push('NDEF');

      this.sinon.stub(window, 'MozActivity');
      var stubHandleNdefMessage = this.sinon.stub(NfcManager,
                                                  'handleNdefMessage',
                                                  () => null);

      NfcManager.fireNDEFDiscovered(msg, msg.techList[0]);
      assert.isTrue(stubHandleNdefMessage.withArgs(msg.records).calledOnce);
      assert.deepEqual(MozActivity.firstCall.args[0], {
        name: 'nfc-ndef-discovered',
        data: {
                type: 'unknown',
                tech: msg.techList[0],
                techList: msg.techList,
                sessionToken: msg.sessionToken
        }
      });
    });
  }),

  suite('fireTagDiscovered', function() {
    var msg = {
      sessionToken: 'token',
      techList: ['NDEF_FORMATABLE', 'ISODEP', 'FAKE_TECH'],
      type: 'techDiscovered',
      records: []
    };

    test('NDEF_FORMATABLE tech type', function() {
      this.sinon.stub(window, 'MozActivity');
      var dummyMsg = Object.create(msg);

      NfcManager.fireTagDiscovered(dummyMsg, dummyMsg.techList[0]);
      assert.deepEqual(MozActivity.getCall(0).args[0],
                       {
                         name: 'nfc-tag-discovered',
                         data: {
                           type: 'NDEF_FORMATABLE',
                           techList: dummyMsg.techList,
                           sessionToken: dummyMsg.sessionToken,
                           records: dummyMsg.records
                         }
                       });
    });
  });

  suite('handleNdefMessage', function() {
    var execCommonTest = function(message, type, name) {
      var activityOptions = NfcManager.handleNdefMessage(message);

      assert.equal(activityOptions.name, name || 'nfc-ndef-discovered');
      assert.equal(activityOptions.data.type, type);
      assert.equal(activityOptions.data.records, message);

      return activityOptions;
    };

    test('TNF empty', function() {
      var dummyNdefMsg = [new MozNDEFRecord(NDEF.TNF_EMPTY, null, null, null)];
      execCommonTest(dummyNdefMsg, 'empty');
    });

    test('TNF well known rtd text utf 8', function() {
      var payload = new Uint8Array([0x02, 0x65, 0x6E, 0x48,
                                    0x65, 0x79, 0x21, 0x20,
                                    0x55, 0x54, 0x46, 0x2D,
                                    0x38, 0x20, 0x65, 0x6E]);
      var dummyNdefMsg = [new MozNDEFRecord(NDEF.TNF_WELL_KNOWN,
                                            NDEF.RTD_TEXT,
                                            new Uint8Array(),
                                            payload)];

      var activityOptions = execCommonTest(dummyNdefMsg, 'text');
      assert.equal(activityOptions.data.text, 'Hey! UTF-8 en');
      assert.equal(activityOptions.data.rtd, NDEF.RTD_TEXT);
      assert.equal(activityOptions.data.language, 'en');
      assert.equal(activityOptions.data.encoding, 'UTF-8');
    });

    test('TNF well known rtd text utf 16', function() {
      var payload = Uint8Array([0x82, 0x65, 0x6E, 0xFF,
                                0xFE, 0x48, 0x00, 0x6F,
                                0x00, 0x21, 0x00, 0x20,
                                0x00, 0x55, 0x00, 0x54,
                                0x00, 0x46, 0x00, 0x2D,
                                0x00, 0x31, 0x00, 0x36,
                                0x00, 0x20, 0x00, 0x65,
                                0x00, 0x6E, 0x00]);
      var dummyNdefMsg = [new MozNDEFRecord(NDEF.TNF_WELL_KNOWN,
                                            NDEF.RTD_TEXT,
                                            new Uint8Array(),
                                            payload)];

      var activityOptions = execCommonTest(dummyNdefMsg, 'text');

      assert.equal(activityOptions.data.text, 'Ho! UTF-16 en');
      assert.equal(activityOptions.data.rtd, NDEF.RTD_TEXT);
      assert.equal(activityOptions.data.language, 'en');
      assert.equal(activityOptions.data.encoding, 'UTF-16');
    });

    test('TNF well known rtd uri', function() {
      var payload = new Uint8Array([0x04, 0x77, 0x69, 0x6B,
                                    0x69, 0x2E, 0x6D, 0x6F,
                                    0x7A, 0x69, 0x6C, 0x6C,
                                    0x61, 0x2E, 0x6F, 0x72,
                                    0x67]);
      var dummyNdefMsg = [new MozNDEFRecord(NDEF.TNF_WELL_KNOWN,
                                            NDEF.RTD_URI,
                                            new Uint8Array(),
                                            payload)];

      var activityOptions = execCommonTest(dummyNdefMsg, 'url');
      assert.equal(activityOptions.data.url, 'https://wiki.mozilla.org');
    });

    test('TNF well known mailto: uri', function() {
      var payload = new Uint8Array([6].concat(
        Array.apply([], NfcUtils.fromUTF8('jorge@borges.ar'))));
      var dummyNdefMsg = [new MozNDEFRecord(NDEF.TNF_WELL_KNOWN,
                                            NDEF.RTD_URI,
                                            new Uint8Array(),
                                            payload)];
      var activityOptions = execCommonTest(dummyNdefMsg, 'mail', 'new');
      assert.equal(activityOptions.data.url, 'mailto:jorge@borges.ar');
    });

    test('TNF well known tel: uri', function() {
      var payload = new Uint8Array([5].concat(
        Array.apply([], NfcUtils.fromUTF8('0054267437'))));
      var dummyNdefMsg = [new MozNDEFRecord(NDEF.TNF_WELL_KNOWN,
                                            NDEF.RTD_URI,
                                            new Uint8Array(),
                                            payload)];
      var activityOptions = execCommonTest(dummyNdefMsg, 'webtelephony/number',
                                           'dial');
      assert.equal(activityOptions.data.uri, 'tel:0054267437');
      assert.equal(activityOptions.data.number, '0054267437');
    });

    test('TNF well known, rtd uri unabbreviated', function() {
      var uri = Array.apply([], NfcUtils.fromUTF8('http://mozilla.com'));
      var payload = [0x00].concat(uri);
      var dummyNdefMsg = [new MozNDEFRecord(NDEF.TNF_WELL_KNOWN,
                                            NDEF.RTD_URI,
                                            new Uint8Array(),
                                            new Uint8Array(payload))];
      var activityOptions = execCommonTest(dummyNdefMsg, 'url');
      assert.equal(activityOptions.data.url, 'http://mozilla.com');
    });

    test('TNF mime media-type text/plain', function() {
      var type = new Uint8Array([0x74, 0x65, 0x78, 0x74,
                                 0x2F, 0x70, 0x6C, 0x61,
                                 0x69, 0x6E]);
      // What up?!
      var payload = new Uint8Array([0x57, 0x68, 0x61, 0x74,
                                    0x20, 0x75, 0x70, 0x3F,
                                    0x21]);
      var dummyNdefMsg = [new MozNDEFRecord(NDEF.TNF_MIME_MEDIA,
                                            type,
                                            new Uint8Array(),
                                            payload)];

      execCommonTest(dummyNdefMsg, 'text/plain');
    });

    test('TNF absolute uri', function() {
      // TNF_ABSOLUTE_URI has uri in the type
      var type = new Uint8Array([0x68, 0x74, 0x74, 0x70,
                                 0x3A, 0x2F, 0x2F, 0x6D,
                                 0x6F, 0x7A, 0x69, 0x6C,
                                 0x6C, 0x61, 0x2E, 0x6F,
                                 0x72, 0x67]);
      var dummyNdefMsg = [new MozNDEFRecord(NDEF.TNF_ABSOLUTE_URI,
                                            type,
                                            new Uint8Array(),
                                            new Uint8Array())];

      execCommonTest(dummyNdefMsg, 'http://mozilla.org');
    });

    test('TNF external type', function() {
      var type = new Uint8Array([0x6D, 0x6F, 0x7A, 0x69,
                                 0x6C, 0x6C, 0x61, 0x2E,
                                 0x6F, 0x72, 0x67, 0x3A,
                                 0x62, 0x75, 0x67]);
      var payload = new Uint8Array([0x31, 0x30, 0x30, 0x30,
                                    0x39, 0x38, 0x31]);
      var dummyNdefMsg = [new MozNDEFRecord(NDEF.TNF_EXTERNAL_TYPE,
                                            type,
                                            new Uint8Array(),
                                            payload)];

      execCommonTest(dummyNdefMsg, 'mozilla.org:bug');
    });

    test('TNF unknown, unchanged, reserved', function() {
      var pld = NfcUtils.fromUTF8('payload');
      var empt = new Uint8Array();
      var unknwn = [new MozNDEFRecord(NDEF.TNF_UNKNOWN, empt, empt, pld)];
      var unchngd = [new MozNDEFRecord(NDEF.TNF_UNCHANGED, empt, empt, pld)];
      var rsrvd = [new MozNDEFRecord(NDEF.TNF_RESERVED, empt, empt, pld)];

      execCommonTest(unknwn, undefined);
      execCommonTest(rsrvd, undefined);

      var activityUnchngd = NfcManager.handleNdefMessage(unchngd);
      assert.equal(activityUnchngd.name, 'nfc-ndef-discovered');
      assert.isUndefined(activityUnchngd.data.type);
      assert.isUndefined(activityUnchngd.data.records);
    });

    suite('Smart posters', function() {
      /**
       * Constructs a NDEF message with one record. This record
       * is a smart poster, so it contains multiple subrecords
       * in the payload, encoded as bytes.
       *
       * Accepts 3*N arguments, where:
       *  3*(N + 0) argument - TNF of the record
       *  3*(N + 1) argument - type given as string
       *  3*(N + 2) argument - payload, given as Uint8Array
       */
      var makePoster = function() {
        var records = [];
        for (var arg = 0; arg < arguments.length; arg += 3) {
          records.push({
            tnf: arguments[arg],
            type: NfcUtils.fromUTF8(arguments[arg + 1]),
            payload: arguments[arg + 2],
            id: new Uint8Array()
          });
        }

        var payload = NfcUtils.encodeNDEF(records);
        return [new MozNDEFRecord(NDEF.TNF_WELL_KNOWN,
                                  NDEF.RTD_SMART_POSTER,
                                  new Uint8Array(),
                                  new Uint8Array(payload))];
      };

      var recordURI,
          recordTextEnglish,
          recordTextPolish,
          recordAction,
          recordIcon;

      setup(function() {
        // URI "http://www.youtube.com" with abbreviation
        // for "http://www."
        recordURI = [
          0x01,  // Payload: abbreviation
          0x79, 0x6F, 0x75, 0x74, // 'yout'
          0x75, 0x62, 0x65, 0x2E, // 'ube.'
          0x63, 0x6F, 0x6D        // 'com'
        ];

        // Text record with contents: "Best page ever!  q#@"
        // and language code: "en"
        recordTextEnglish = [
          0x02,  // Status byte: UTF-8, two byte lang code
          0x65, 0x6E, // ISO language code: 'en'
          0x42, 0x65, 0x73, 0x74, // 'Best'
          0x20, 0x70, 0x61, 0x67, // ' pag'
          0x65, 0x20, 0x65, 0x76, // 'e ev'
          0x65, 0x72, 0x21, 0x20, // 'er! '
          0x20, 0x71, 0x23, 0x40  // ' q#@'
        ];

        // Text record with contents: "ąćńó"
        // and language code: "pl"
        recordTextPolish = [
         0x02,  // Status byte: UTF-8, two byte lang code
         0x70, 0x6C, // ISO language code: 'pl'
         0xC4, 0x85, 0xC4, 0x87, // 'ąć'
         0xC5, 0x84, 0xC3, 0xB3  // 'ńó'
        ];

        // Action record with action = 0
        recordAction = [0x00];

        // Icon record with simple 4x4 PNG image.
        recordIcon = [
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
          0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
          0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0x04,
          0x08, 0x02, 0x00, 0x00, 0x00, 0x26, 0x93, 0x09,
          0x29, 0x00, 0x00, 0x00, 0x1b, 0x49, 0x44, 0x41,
          0x54, 0x08, 0xd7, 0x63, 0xf8, 0xff, 0xff, 0x3f,
          0x03, 0x0c, 0x30, 0xc2, 0x39, 0x8c, 0x8c, 0x8c,
          0x4c, 0x10, 0x0a, 0x2a, 0x85, 0xac, 0x0c, 0x00,
          0x26, 0x0b, 0x09, 0x01, 0xc3, 0xd1, 0x9a, 0x7b,
          0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44,
          0xae, 0x42, 0x60, 0x82
        ];
      });

      test('Decodes simple poster', function() {
        var poster = makePoster(NDEF.TNF_WELL_KNOWN, 'U', recordURI);
        var activityOptions = execCommonTest(poster, 'url');
        assert.equal(activityOptions.data.url, 'http://www.youtube.com');
      });

      test('Decodes extra records', function() {
        var poster = makePoster(NDEF.TNF_WELL_KNOWN, 'U', recordURI,
                                NDEF.TNF_WELL_KNOWN, 'T', recordTextEnglish,
                                NDEF.TNF_WELL_KNOWN, 'T', recordTextPolish,
                                NDEF.TNF_WELL_KNOWN, 'act', recordAction,
                                NDEF.TNF_MIME_MEDIA, 'image/png', recordIcon);

        var activityOptions = execCommonTest(poster, 'url');
        assert.equal(activityOptions.data.url, 'http://www.youtube.com');
        assert.equal(activityOptions.data.text.en, 'Best page ever!  q#@');
        assert.equal(activityOptions.data.text.pl, 'ąćńó');
        assert.equal(activityOptions.data.icons.length, 1);
        assert.equal(activityOptions.data.icons[0].type, 'image/png');
        assert.isTrue(NfcUtils.equalArrays(activityOptions.data.icons[0].bytes,
                                           recordIcon));
      });

      test('Does not handle poster with multiple URIs', function() {
        var poster = makePoster(NDEF.TNF_WELL_KNOWN, 'U', recordURI,
                                NDEF.TNF_WELL_KNOWN, 'U', recordURI);

        var activityOptions = NfcManager.handleNdefMessage(poster);
        assert.deepEqual(activityOptions.data, {});
      });

      test('Does not handle poster with no URI', function() {
        var poster = makePoster(NDEF.TNF_WELL_KNOWN, 'T', recordTextEnglish,
                                NDEF.TNF_WELL_KNOWN, 'act', recordAction);

        var activityOptions = NfcManager.handleNdefMessage(poster);
        assert.deepEqual(activityOptions.data, {});
      });

      test('Does not handle poster with multiple title ' +
        'records in the same language', function() {

        var poster = makePoster(NDEF.TNF_WELL_KNOWN, 'U', recordURI,
                                NDEF.TNF_WELL_KNOWN, 'T', recordTextEnglish,
                                NDEF.TNF_WELL_KNOWN, 'T', recordTextEnglish);

        var activityOptions = NfcManager.handleNdefMessage(poster);
        assert.deepEqual(activityOptions.data, {});
      });

      test('Handles poster with not supported recrods',
        function() {

        var poster = makePoster(NDEF.TNF_WELL_KNOWN, 'U', recordURI,
                                NDEF.TNF_WELL_KNOWN, 'T', recordTextEnglish,
                                NDEF.TNF_WELL_KNOWN, 'X', [0xAB, 0xCD, 0xEF]);

        var activityOptions = execCommonTest(poster, 'url');
        assert.equal(activityOptions.data.url, 'http://www.youtube.com');
        assert.equal(activityOptions.data.text.en, 'Best page ever!  q#@');

        // Unsupported 'X' record is last, so look at last 7 bytes
        // from payload: 1 byte - header (TNF+flags),
        //               1 byte - type length,
        //               1 byte - payload length
        //               1 byte - name
        //               3 bytes - payload
        var records = Array.apply([], activityOptions.data.records[0].payload);
        var recordX = records.slice(records.length - 7);
        assert.deepEqual(recordX, [0x51, 0x01, 0x03, 0x58, 0xAB, 0xCD, 0xEF]);
      });

      test('When smart poster is first of multiple toplevel records, ' +
        'it takes precedence', function() {

        var poster = makePoster(NDEF.TNF_WELL_KNOWN, 'U', recordURI);
        poster.push(new MozNDEFRecord(NDEF.TNF_WELL_KNOWN,
                                      NDEF.RTD_URI,
                                      new Uint8Array(),
                                      [0x01, 0x77, 0x69, 0x6B, 0x69, // 'wiki'
                                       0x70, 0x65, 0x64, 0x69, 0x61, // 'pedia'
                                       0x2E, 0x6F, 0x72, 0x67]));    // '.com'

        var activityOptions = execCommonTest(poster, 'url');
        assert.equal(activityOptions.data.url, 'http://www.youtube.com');
      });

      test('When smart poster is one of multiple toplevel records, ' +
        'it takes precedence over other URI records', function() {

        var poster = makePoster(NDEF.TNF_WELL_KNOWN, 'U', recordURI);
        poster.unshift(new MozNDEFRecord(NDEF.TNF_WELL_KNOWN,
                                      NDEF.RTD_URI,
                                      new Uint8Array(),
                                      new Uint8Array(
                                      [0x01, 0x77, 0x69, 0x6B, 0x69, // 'wiki'
                                       0x70, 0x65, 0x64, 0x69, 0x61, // 'pedia'
                                       0x2E, 0x6F, 0x72, 0x67])));   // '.com'

        var activityOptions = execCommonTest(poster, 'url');
        assert.equal(activityOptions.data.url, 'http://www.youtube.com');
      });
    });
  });

  suite('Activity Routing', function() {
    var vcard;
    var activityInjection1;
    var activityInjection2;
    var activityInjection3;

    setup(function() {
      vcard = 'BEGIN:VCARD\n';
      vcard += 'VERSION:2.1\n';
      vcard += 'N:Office;Mozilla;;;\n';
      vcard += 'FN:Mozilla Office\n';
      vcard += 'TEL;PREF:1-555-555-5555\n';
      vcard += 'END:VCARD';

      activityInjection1 = {
        type: 'techDiscovered',
        techList: ['P2P', 'NDEF'],
        records: [{
          tnf: NDEF.TNF_MIME_MEDIA,
          type: NfcUtils.fromUTF8('text/vcard'),
          id: new Uint8Array(),
          payload: NfcUtils.fromUTF8(vcard)
        }],
        sessionToken: '{e9364a8b-538c-4c9d-84e2-e6ce524afd17}'
      };
      activityInjection2 = {
        type: 'techDiscovered',
        techList: ['P2P', 'NDEF'],
        records: [{
          tnf: NDEF.TNF_MIME_MEDIA,
          type: NfcUtils.fromUTF8('text/x-vcard'),
          id: new Uint8Array(),
          payload: NfcUtils.fromUTF8(vcard)
        }],
        sessionToken: '{e9364a8b-538c-4c9d-84e2-e6ce524afd18}'
      };
      activityInjection3 = {
        type: 'techDiscovered',
        techList: ['P2P', 'NDEF'],
        records: [{
          tnf: NDEF.TNF_MIME_MEDIA,
          type: NfcUtils.fromUTF8('text/x-vCard'),
          id: new Uint8Array(),
          payload: NfcUtils.fromUTF8(vcard)
        }],
        sessionToken: '{e9364a8b-538c-4c9d-84e2-e6ce524afd19}'
      };
    });

    test('text/vcard', function() {
      var spyFormatVCardRecord = this.sinon.spy(NfcManager,
                                                'formatVCardRecord');

      NfcManager.handleTechnologyDiscovered(activityInjection1);
      assert.isTrue(spyFormatVCardRecord.calledOnce);

      NfcManager.handleTechnologyDiscovered(activityInjection2);
      assert.isTrue(spyFormatVCardRecord.calledTwice);

      NfcManager.handleTechnologyDiscovered(activityInjection3);
      assert.isTrue(spyFormatVCardRecord.calledThrice);
    });
  });

  suite('NFC Manager Dispatch Events', function() {
    var aUUID = '{4f4787c4-51f0-4288-8caf-55d440303b0b}';
    var vcard;
    var realMozNfc;

    setup(function() {
      vcard = 'BEGIN:VCARD\n';
      vcard += 'VERSION:2.1\n';
      vcard += 'END:VCARD';

      // realMozNfc requires platform support, use a Mock
      realMozNfc = navigator.mozNfc;
      navigator.mozNfc = MockNfc;
    });

    teardown(function() {
      navigator.mozNfc = realMozNfc;
    });

    test('NFC Manager Outgoing DispatchEvents', function() {
      var command = {
        sessionToken: aUUID,
        techList: ['NDEF'],
        records: [{
          tnf: NDEF.TNF_MIME_MEDIA,
          type: NfcUtils.fromUTF8('text/vcard'),
          id: new Uint8Array(),
          payload: NfcUtils.fromUTF8(vcard)
        }]
      };

      var stubDispatchEvent = this.sinon.stub(window, 'dispatchEvent');

      NfcManager.handleTechnologyDiscovered(command);
      assert.isTrue(stubDispatchEvent.calledOnce);
      assert.equal(stubDispatchEvent.getCall(0).args[0].type,
                   'nfc-tech-discovered');

      NfcManager.handleTechLost(command);
      assert.isTrue(stubDispatchEvent.calledThrice);
      assert.equal(stubDispatchEvent.getCall(1).args[0].type, 'nfc-tech-lost');
      assert.equal(stubDispatchEvent.getCall(2).args[0].type,
        'shrinking-stop');
    });

    test('NFC Manager P2P: checkP2PRegistration success', function() {
      // Setup Fake DOMRequest to stub with:
      var fakeDOMRequest = new MockDOMRequest();
      this.sinon.stub(navigator.mozNfc, 'checkP2PRegistration',
                                        function(manifest) {
                                          return fakeDOMRequest;
                                        });
      var stubDispatchEvent = this.sinon.stub(window, 'dispatchEvent');
      var spyAddEventListener = this.sinon.spy(window, 'addEventListener');

      // An unprivilaged P2P UI would send message to NFC Manager to validate
      // P2P registration in the stubbed DOM.
      NfcManager.checkP2PRegistration('dummyManifestUrl');

      fakeDOMRequest.fireSuccess(true);
      stubDispatchEvent.getCall(0).calledWith({ type: 'shrinking-start',
                                                bubbles: false });
      assert.isTrue(spyAddEventListener.withArgs('shrinking-sent').calledOnce);
    });

    test('NFC Manager P2P: checkP2PRegistration error', function() {
      // Setup Fake DOMRequest to stub with:
      var fakeDOMRequest = new MockDOMRequest();
      this.sinon.stub(navigator.mozNfc, 'checkP2PRegistration',
                                        function(manifestURL) {
                                          return fakeDOMRequest;
                                        });
      var stubDispatchEvent = this.sinon.stub(window, 'dispatchEvent');
      var spyRemoveEventListener = this.sinon.spy(window,
                                                  'removeEventListener');

      // An unprivilaged P2P UI would send message to NFC Manager to validate
      // P2P registration in the stubbed DOM.
      NfcManager.checkP2PRegistration('dummyManifestUrl');

      // Note: Error status is fired through the success code path.
      fakeDOMRequest.fireSuccess(false);
      stubDispatchEvent.getCall(0).calledWith({ type: 'shrinking-stop',
                                                bubbles: false });
      assert.isTrue(
        spyRemoveEventListener.withArgs('shrinking-sent').calledOnce);
    });

  });

  suite('NFC Manager getPrioritizedTech test', function() {
    var techList1 = ['NDEF_WRITEABLE', 'P2P', 'NDEF', 'NDEF_FORMATABLE'];
    var techList2 = ['NDEF_WRITEABLE', 'NDEF', 'NDEF_FORMATABLE'];
    var techList3 = ['NDEF_WRITEABLE', 'NDEF', 'NFC_ISO_DEP'];
    var techList4 = [];

    test('techList P2P test', function() {
      var tech = NfcManager.getPrioritizedTech(techList1);
      assert.equal(tech, 'P2P');
    });

    test('techList NDEF test', function() {
      var tech = NfcManager.getPrioritizedTech(techList2);
      assert.equal(tech, 'NDEF');
    });

    test('techList Unsupported technology test', function() {
      var tech = NfcManager.getPrioritizedTech(techList3);
      assert.equal(tech, 'NDEF');
    });

    test('techList empty', function() {
      var tech = NfcManager.getPrioritizedTech(techList4);
      assert.equal(tech, 'Unknown');
    });
  });

  suite('NFC Manager changeHardwareState test', function() {
    var realNfc = navigator.mozNfc;

    setup(function() {
      navigator.mozNfc = MockNfc;
    });

    teardown(function() {
      navigator.mozNfc = realNfc;
    });

    test('NFC Manager startPoll', function() {
      var spyStartPoll = this.sinon.spy(MockNfc, 'startPoll');
      var spyStopPoll = this.sinon.spy(MockNfc, 'stopPoll');
      var spyPowerOff = this.sinon.spy(MockNfc, 'powerOff');
      var spyDispatchEvent = this.sinon.spy(window, 'dispatchEvent');

      NfcManager.changeHardwareState(NfcManager.NFC_HW_STATE_OFF);
      assert.isTrue(spyPowerOff.calledOnce);
      assert.isTrue(spyDispatchEvent.calledOnce);

      NfcManager.changeHardwareState(NfcManager.NFC_HW_STATE_ON);
      assert.isTrue(spyStartPoll.calledOnce);
      assert.isTrue(spyDispatchEvent.calledTwice);

      NfcManager.changeHardwareState(NfcManager.NFC_HW_STATE_ENABLE_DISCOVERY);
      assert.isTrue(spyStartPoll.calledTwice);

      NfcManager.changeHardwareState(NfcManager.NFC_HW_STATE_DISABLE_DISCOVERY);
      assert.isTrue(spyStopPoll.calledOnce);
    });
  });
});
