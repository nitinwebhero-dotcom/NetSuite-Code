/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 */
define(['N/record', 'N/search', 'N/log', 'N/runtime'],
    (record, search, log, runtime) => {

        function getParameters() {
            const script = runtime.getCurrentScript();

            return {
                waveTemplateId: script.getParameter({ name: 'custscript_wave_template_id' })
            };
        }

        function createWave(locationId, customerId, waveTemplateId) {
            const wave = record.create({
                type: record.Type.WAVE,
                isDynamic: true
            });
            
            let pickType = 'MULTI';
            if (locationId === '13' && customerId === 16886) {      
                  pickType = 'SINGLE';
            }

            wave.setValue({ fieldId: 'location', value: locationId });
            wave.setValue({ fieldId: 'wavetype', value: 'SalesOrd' });
            wave.setValue({ fieldId: 'priority', value: '1' });
            wave.setValue({ fieldId: 'picktype', value: pickType });

            wave.setValue({
                fieldId: 'searchtemplateid',
                value: waveTemplateId
            });

            wave.setValue({
                fieldId: 'newwavestatus',
                value: 'RELEASED'
            });

            return wave.save();
        }

        function markSO(salesOrderId, flag) {
            record.submitFields({
                type: record.Type.SALES_ORDER,
                id: salesOrderId,
                values: {
                    custbody_wave_ready: flag
                }
            });
        }

        function getSalesOrders(params) {

            let soSearch;
            soSearch = search.create({
                type: search.Type.SALES_ORDER,
                filters: [
                    ["type", "anyof", "SalesOrd"],
                    "AND",
                    ["status", "anyof", "SalesOrd:B", "SalesOrd:D"],
                    "AND",
                    ["custbody_wmsse_ordertype", "anyof", "2"],
                    "AND",
                    ["custbody_wave_ready", "is", "F"],
                    "AND",
                    ["custbody_ch_mto_order", "is", "F"],
                    "AND",
                    ["location", "anyof", "13", "19", "20", "16", "14", "106", "18", "17", "21", "6"],
                    "AND",
                    ["custcol_ch_psg_se_001", "is", "T"]
                ],
                columns: [
                    search.createColumn({
                        name: "location",
                        summary: "GROUP",
                        label: "Location"
                    }),
                    search.createColumn({
                        name: "internalid",
                        join: "customer",
                        summary: "GROUP",
                        label: "Customer ID"
                    }),
                    search.createColumn({
                        name: "internalid",
                        summary: "GROUP",
                        label: "Internal ID"
                    })
                ]
            });


            return soSearch.runPaged({ pageSize: 1000 });
        }

        function checkUsingFilter(locations) {
            return locations.every(val => val === locations[0]);
        }

        function areAllLineLocationsSame(salesOrderId) {

            const soRec = record.load({
                type: record.Type.SALES_ORDER,
                id: salesOrderId,
                isDynamic: false
            });

            const lineCount = soRec.getLineCount({ sublistId: 'item' });
            const locations = [];

            for (let i = 0; i < lineCount; i++) {
                const loc = soRec.getSublistValue({
                    sublistId: 'item',
                    fieldId: 'location',
                    line: i
                });

                if (loc) {
                    locations.push(loc);
                }
            }

            log.debug('Locations', locations);

            const loc_ = checkUsingFilter(locations);
            return loc_;
        }

        function processWaves(params) {
            const pagedData = getSalesOrders(params);

            log.debug('Total Pages', pagedData.pageRanges.length);

            pagedData.pageRanges.forEach((pageRange) => {

                const page = pagedData.fetch({ index: pageRange.index });

                page.data.forEach((result) => {

                    const salesOrderId = result.getValue({
                        name: "internalid",
                        summary: "GROUP",
                        label: "Internal ID"
                    });

                    const customerId = Number(result.getValue({
                        name: "internalid",
                        join: "customer",
                        summary: "GROUP",
                        label: "Customer ID"
                    }));
                    log.debug('Customer ID', customerId);

                    const location = result.getValue({
                        name: "location",
                        summary: "GROUP",
                        label: "Location"
                    });

                    try {
                        log.debug('Processing SO', salesOrderId);

                        const areAllLocationSame = areAllLineLocationsSame(salesOrderId);
                        log.debug('areAllLocationSame', areAllLocationSame);
                        log.debug('type of areAllLocationSame', typeof (areAllLocationSame));

                        if (!areAllLocationSame) {
                            log.debug('Locations are different', salesOrderId);
                            return;
                        }

                        // Step 1: Flag SO
                        markSO(salesOrderId, true);

                        // Step 2: Create Wave
                        const waveId = createWave(
                            location,
                            customerId,
                            params.waveTemplateId
                        );

                        log.debug('Wave Created', `SO: ${salesOrderId}, Wave: ${waveId}`);

                        // Step 3: Reset flag
                        markSO(salesOrderId, false);

                    } catch (err) {
                        log.error(`Error SO ${salesOrderId}`, err.message);

                        // Cleanup safety
                        try {
                            markSO(salesOrderId, false);
                        } catch (cleanupErr) {
                            log.error('Cleanup Failed', cleanupErr.message);
                        }
                    }
                });
            });
        }

        function execute(context) {
            try {
                const params = getParameters();

                log.debug('Parameters', params);

                if (!params.waveTemplateId) {
                    log.error('Missing Parameter', 'Wave Template is required');
                    return;
                }

                processWaves(params);

            } catch (e) {
                log.error('Fatal Error', e.message);
            }
        }

        return { execute };
    });