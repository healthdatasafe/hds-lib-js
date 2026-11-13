/**
 * Hook for webpack to build browser test-suite
 * Every `*.test.js` file is listed here, except the node-only ones:
 * - validatorDrift.test.js (reads the file system and runs the validator build)
 * - browserSuiteCoverage.test.js (reads this file; fails when a test file is neither listed nor excluded)
 */
import './accountPreferences.test.js';
import './appDescription.test.js';
import './applicationClass.test.js';
import './appScope.test.js';
import './apptemplatesRequest.test.js';
import './attachmentsItems.test.js';
import './bridgeAccess.test.js';
import './cmcConstants.test.js';
import './cmcDataExport.test.js';
import './cmcDocuments.test.js';
import './cmcFormSpec.test.js';
import './cmcItemReminders.test.js';
import './cmcScope.test.js';
import './codedMedicationTemplate.test.js';
import './connectors.test.js';
import './contact.test.js';
import './contextResolution.test.js';
import './conversions.test.js';
import './converterEngine.test.js';
import './cyclePhase.test.js';
import './datasetTemplate.test.js';
import './delegation.test.js';
import './encounters.test.js';
import './errors.test.js';
import './eventDetails.test.js';
import './eventToShortText.test.js';
import './formatEventDate.test.js';
import './genetics.test.js';
import './getAttachmentUrl.test.js';
import './hdsLib.test.js';
import './hdsModel.test.js';
import './HDSModel-Overload.test.js';
import './HDSProfile.test.js';
import './HDSProfileLocale.test.js';
import './HDSSettings.test.js';
import './initHDSModel.test.js';
import './itemLabels.test.js';
import './itemsDefsAliases.test.js';
import './labResults.test.js';
import './legacyChat.test.js';
import './libSettings.test.js';
import './loader.test.js';
import './localizeText.test.js';
import './logger.test.js';
import './medication.test.js';
import './modelLoadRetry.test.js';
import './MonitorScope.test.js';
import './permissionLabels.test.js';
import './preferred.test.js';
import './questionnaire.test.js';
import './reminders.test.js';
import './resolveStream.test.js';
import './systemItems.test.js';
import './temperatureShift.test.js';
import './toolkitStreamAutoCreate.test.js';
import './toolkitStreamsTools.test.js';
import './twinSatisfies.test.js';
