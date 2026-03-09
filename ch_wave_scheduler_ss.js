/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 * @NModuleScope SameAccount
 *
 * ============================================================================
 * Classic Home — Wave Scheduler (Scheduled Script)
 * ============================================================================
 *
 * PURPOSE:
 *   Orchestrator that runs on configurable schedules and triggers the
 *   Map/Reduce Wave Builder for the appropriate business units.
 *
 *   Replaces the manual process where warehouse staff must remember to
 *   create waves at specific intervals throughout the day.
 *
 * DEPLOYMENT SCHEDULE (from Robert Garcia's specifications):
 *
 *   Deployment 1 — Division (Furniture, Rugs, Villa):
 *     Schedule: Every 2.5 hours during operating hours
 *     Runs at: 6:00 AM, 8:30 AM, 11:00 AM, 1:30 PM, 4:00 PM
 *     → Approximately 4-5 wave cycles per day
 *
 *   Deployment 2 — E-commerce:
 *     Schedule: Every 15 minutes during operating hours
 *     Runs at: 6:00 AM through 5:00 PM (every 15 min)
 *     → Approximately 44 wave cycles per day
 *
 *   Deployment 3 — Private Label:
 *     Schedule: Every 4 hours during operating hours
 *     Runs at: 6:00 AM, 10:00 AM, 2:00 PM
 *     → Approximately 3 wave cycles per day
 *
 * OPERATING HOURS:
 *   6:00 AM to 5:00 PM Pacific Time (two warehouse shifts)
 *
 * SCRIPT PARAMETERS:
 *   custscript_ws_business_units  — Comma-separated BU list
 *   custscript_ws_location        — Warehouse location (default: VEMW)
 *   custscript_ws_max_per_wave    — Max orders per wave (default: 50)
 *   custscript_ws_picking_pref    — Picking type preference (single/multiple/auto)
 *   custscript_ws_notify_emails   — Comma-separated employee IDs for notifications
 *   custscript_ws_mr_script_id    — Internal ID of the Map/Reduce script
 *   custscript_ws_mr_deploy_id    — Internal ID of the Map/Reduce deployment
 *   custscript_ws_enabled         — Master on/off switch (default: true)
 *   custscript_ws_operating_start — Operating hours start (default: 6 = 6 AM)
 *   custscript_ws_operating_end   — Operating hours end (default: 17 = 5 PM)
 *
 * AUTHOR: Atul Pandey
 * DATE:   February 2026
 * ============================================================================
 */

define([
    'N/task',
    'N/runtime',
    'N/log',
    'N/search',
    'N/email',
    'N/record',
    'N/format'
], function (task, runtime, log, search, email, record, format) {

    // ========================================================================
    // DEFAULT CONFIGURATION
    // ========================================================================

    const DEFAULTS = {
        LOCATION:         'VEMW',
        MAX_PER_WAVE:     50,
        PICKING_PREF:     'auto',      // auto | single | multiple
        OPERATING_START:  6,           // 6:00 AM
        OPERATING_END:    17,          // 5:00 PM
        TIMEZONE:         'America/Los_Angeles'
    };

    /**
     * Default Business Unit groups (matching the transcript).
     * Division handles: Furniture, Rugs, Villa, Villa Home, CH Furniture
     */
    const BU_GROUPS = {
        division: 'FURNITURE,RUGS,VILLA,VILLA HOME,CH FURNITURE',
        ecom:     'ECOMM',
        pl:       'PRIVATE LABEL'
    };

    // ========================================================================
    // MAIN EXECUTION
    // ========================================================================

    /**
     * Scheduled Script entry point.
     * Called by NetSuite's scheduler on each configured interval.
     */
    function execute(context) {
        var script = runtime.getCurrentScript();

        // -----------------------------------------------------------------
        // 1. READ SCRIPT PARAMETERS
        // -----------------------------------------------------------------
        var enabled = script.getParameter({ name: 'custscript_ws_enabled' });
        if (enabled === false || enabled === 'F') {
            log.audit('execute', 'Wave Scheduler is DISABLED. Exiting.');
            return;
        }

        var businessUnitsParam = script.getParameter({ name: 'custscript_ws_business_units' });
        var locationParam      = script.getParameter({ name: 'custscript_ws_location' }) || DEFAULTS.LOCATION;
        var maxPerWaveParam    = script.getParameter({ name: 'custscript_ws_max_per_wave' }) || DEFAULTS.MAX_PER_WAVE;
        var pickingPref        = script.getParameter({ name: 'custscript_ws_picking_pref' }) || DEFAULTS.PICKING_PREF;
        var notifyEmailsParam  = script.getParameter({ name: 'custscript_ws_notify_emails' }) || '';
        var mrScriptId         = script.getParameter({ name: 'custscript_ws_mr_script_id' });
        var mrDeployId         = script.getParameter({ name: 'custscript_ws_mr_deploy_id' });
        var operatingStart     = script.getParameter({ name: 'custscript_ws_operating_start' }) || DEFAULTS.OPERATING_START;
        var operatingEnd       = script.getParameter({ name: 'custscript_ws_operating_end' }) || DEFAULTS.OPERATING_END;

        // -----------------------------------------------------------------
        // 2. CHECK OPERATING HOURS
        // -----------------------------------------------------------------
        if (!isWithinOperatingHours(operatingStart, operatingEnd)) {
            log.audit('execute', 'Outside operating hours (' +
                operatingStart + ':00 - ' + operatingEnd + ':00). Skipping.');
            return;
        }

        // -----------------------------------------------------------------
        // 3. CHECK FOR ELIGIBLE ORDERS (pre-flight)
        // -----------------------------------------------------------------
        var businessUnits = businessUnitsParam
            ? businessUnitsParam.split(',').map(function (s) { return s.trim(); })
            : BU_GROUPS.division.split(',');

        var eligibleCount = getEligibleOrderCount(businessUnits, locationParam);

        if (eligibleCount === 0) {
            log.audit('execute', 'No wave-eligible orders found for BU: ' +
                businessUnits.join(', ') + '. Skipping wave creation.');
            return;
        }

        log.audit('execute', 'Found ' + eligibleCount + ' eligible order lines for BU: ' +
            businessUnits.join(', ') + '. Triggering Map/Reduce Wave Builder.');

        // -----------------------------------------------------------------
        // 4. CHECK FOR ALREADY-RUNNING MAP/REDUCE TASKS
        // -----------------------------------------------------------------
        if (isMapReduceAlreadyRunning(mrScriptId)) {
            log.audit('execute', 'Map/Reduce Wave Builder is already running. ' +
                'Skipping to avoid duplicate waves.');
            return;
        }

        // -----------------------------------------------------------------
        // 5. TRIGGER MAP/REDUCE WAVE BUILDER
        // -----------------------------------------------------------------
        try {
            var mrTask = task.create({
                taskType: task.TaskType.MAP_REDUCE,
                scriptId: mrScriptId,
                deploymentId: mrDeployId,
                params: {
                    'custscript_wave_business_units': businessUnitsParam || BU_GROUPS.division,
                    'custscript_wave_location':       locationParam,
                    'custscript_wave_max_orders':     maxPerWaveParam
                }
            });

            var taskId = mrTask.submit();

            log.audit('execute', 'Map/Reduce task submitted. Task ID: ' + taskId);

            // Log the run to a custom record for audit trail
            logWaveRun({
                taskId:        taskId,
                businessUnits: businessUnits.join(', '),
                location:      locationParam,
                eligibleCount: eligibleCount,
                status:        'SUBMITTED',
                deploymentId:  script.deploymentId
            });

        } catch (err) {
            log.error('execute', 'Failed to submit Map/Reduce task: ' +
                err.message + '\n' + err.stack);

            // Send alert if wave creation fails
            sendErrorAlert(err, businessUnits.join(', '), notifyEmailsParam);
        }
    }

    // ========================================================================
    // HELPER FUNCTIONS
    // ========================================================================

    /**
     * Checks if the current time falls within operating hours.
     * Operating hours: 6 AM to 5 PM Pacific (from Robert Garcia's specs).
     *
     * @param {number} startHour - Start hour (24h format)
     * @param {number} endHour   - End hour (24h format)
     * @returns {boolean}
     */
    function isWithinOperatingHours(startHour, endHour) {
        var now = new Date();

        // Get Pacific time hour
        var pacificOffset = -8;  // PST (adjust to -7 for PDT if needed)
        var utcHour = now.getUTCHours();
        var pacificHour = (utcHour + pacificOffset + 24) % 24;

        var isWeekday = now.getUTCDay() >= 1 && now.getUTCDay() <= 5;
        var isInHours = pacificHour >= startHour && pacificHour < endHour;

        log.debug('isWithinOperatingHours',
            'Pacific hour: ' + pacificHour + ' | Weekday: ' + isWeekday +
            ' | In hours: ' + isInHours);

        return isWeekday && isInHours;
    }

    /**
     * Quick count of eligible orders without loading full details.
     * Used as a pre-flight check to avoid triggering Map/Reduce unnecessarily.
     *
     * @param {string[]} businessUnits - BU values to check
     * @param {string}   location      - Warehouse location
     * @returns {number} Count of eligible order lines
     */
    function getEligibleOrderCount(businessUnits, location) {
        try {
            var countSearch = search.create({
                type: search.Type.SALES_ORDER,
                filters: [
                    ['type', 'anyof', 'SalesOrd'],
                    'AND',
                    ['class', 'anyof', businessUnits],
                    'AND',
                    ['custbody_wmsse_order_type', 'is', 'Ready for Waving'],
                    'AND',
                    ['status', 'anyof', 'SalesOrd:B'],
                    'AND',
                    ['location', 'anyof', location],
                    'AND',
                    ['quantitycommitted', 'greaterthan', '0'],
                    'AND',
                    ['custbody_ship_eligible', 'is', 'T'],
                    'AND',
                    ['mainline', 'is', 'F'],
                    'AND',
                    ['taxline', 'is', 'F'],
                    'AND',
                    ['shipping', 'is', 'F'],
                    'AND',
                    ['closed', 'is', 'F']
                ],
                columns: [
                    search.createColumn({
                        name: 'internalid',
                        summary: search.Summary.COUNT
                    })
                ]
            });

            var result = countSearch.run().getRange({ start: 0, end: 1 });
            if (result && result.length > 0) {
                return parseInt(result[0].getValue({
                    name: 'internalid',
                    summary: search.Summary.COUNT
                })) || 0;
            }
            return 0;

        } catch (err) {
            log.error('getEligibleOrderCount', 'Search failed: ' + err.message);
            return -1;  // Return -1 to indicate error; caller should still try
        }
    }

    /**
     * Checks if the Map/Reduce Wave Builder is already running.
     * Prevents duplicate wave creation if the scheduler fires
     * while a previous run is still processing.
     *
     * @param {string} mrScriptId - The Map/Reduce script internal ID
     * @returns {boolean} True if already running
     */
    function isMapReduceAlreadyRunning(mrScriptId) {
        if (!mrScriptId) return false;

        try {
            var taskSearch = search.create({
                type: search.Type.SCHEDULED_SCRIPT_TASK,
                filters: [
                    ['script.scriptid', 'is', mrScriptId],
                    'AND',
                    ['status', 'anyof', ['PENDING', 'PROCESSING']]
                ],
                columns: ['status', 'startdate']
            });

            var results = taskSearch.run().getRange({ start: 0, end: 1 });
            return results && results.length > 0;

        } catch (err) {
            log.debug('isMapReduceAlreadyRunning',
                'Could not check running tasks: ' + err.message);
            return false;
        }
    }

    /**
     * Logs the wave run to the Script Execution Log for auditing.
     * Optionally writes to a custom record if one exists.
     *
     * @param {Object} runInfo - Run details to log
     */
    function logWaveRun(runInfo) {
        log.audit('WAVE_RUN_LOG', JSON.stringify({
            timestamp:     new Date().toISOString(),
            taskId:        runInfo.taskId,
            businessUnits: runInfo.businessUnits,
            location:      runInfo.location,
            eligibleCount: runInfo.eligibleCount,
            status:        runInfo.status,
            deploymentId:  runInfo.deploymentId
        }));

        // Optional: Write to a custom record for persistent audit trail
        // Uncomment and configure the custom record type if desired
        /*
        try {
            var auditRecord = record.create({
                type: 'customrecord_ch_wave_audit_log'
            });
            auditRecord.setValue({ fieldId: 'custrecord_wa_timestamp', value: new Date() });
            auditRecord.setValue({ fieldId: 'custrecord_wa_task_id', value: runInfo.taskId });
            auditRecord.setValue({ fieldId: 'custrecord_wa_business_units', value: runInfo.businessUnits });
            auditRecord.setValue({ fieldId: 'custrecord_wa_location', value: runInfo.location });
            auditRecord.setValue({ fieldId: 'custrecord_wa_eligible_count', value: runInfo.eligibleCount });
            auditRecord.setValue({ fieldId: 'custrecord_wa_status', value: runInfo.status });
            auditRecord.save();
        } catch (e) {
            log.debug('logWaveRun', 'Custom audit record not available: ' + e.message);
        }
        */
    }

    /**
     * Sends an error alert email when wave creation fails.
     *
     * @param {Error}  error          - The error that occurred
     * @param {string} businessUnits  - Which BUs were being processed
     * @param {string} recipientsCsv  - Comma-separated employee IDs
     */
    function sendErrorAlert(error, businessUnits, recipientsCsv) {
        if (!recipientsCsv) return;

        var recipients = recipientsCsv.split(',').map(function (s) { return s.trim(); });

        var subject = '[ALERT] Wave Auto-Creation Failed — ' + businessUnits;
        var body = '<h2 style="color:red">Wave Scheduler Error</h2>';
        body += '<p><strong>Time:</strong> ' + new Date().toLocaleString() + '</p>';
        body += '<p><strong>Business Units:</strong> ' + businessUnits + '</p>';
        body += '<p><strong>Error:</strong> ' + error.message + '</p>';
        body += '<pre>' + (error.stack || 'No stack trace') + '</pre>';
        body += '<p>Please check the Script Execution Log for details.</p>';

        try {
            for (var i = 0; i < recipients.length; i++) {
                email.send({
                    author: runtime.getCurrentUser().id,
                    recipients: recipients[i],
                    subject: subject,
                    body: body
                });
            }
        } catch (emailErr) {
            log.error('sendErrorAlert', 'Failed to send alert email: ' + emailErr.message);
        }
    }

    // ========================================================================
    // ENTRY POINT
    // ========================================================================

    return {
        execute: execute
    };
});
