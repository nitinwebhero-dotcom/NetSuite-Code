/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 */
define(['N/record', 'N/search', 'N/log', 'N/runtime'],
    (record, search, log, runtime) => {

        function getParameters() {
            const script = runtime.getCurrentScript();

            return {
                waveTemplateId: script.getParameter({ name: 'custscript_ch_multi_line_template' })
            };
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

        function markWmsOrderTypeAsReadyForWaving(salesOrderId) {
            record.submitFields({
                type: record.Type.SALES_ORDER,
                id: salesOrderId,
                values: {
                    custbody_wmsse_ordertype: 2
                }
            });
        }

        function getSalesOrders() {

            return search.create({
                type: "salesorder",
                settings: [{ "name": "consolidationtype", "value": "ACCTTYPE" }],
                filters:
                    [
                        ["type", "anyof", "SalesOrd"],
                        "AND",
                        ["location", "anyof", "13", "14", "16", "17", "18", "19", "6", "20", "7", "21", "106", "103"],
                        "AND",
                        ["custbody_ch_mto_order", "is", "F"],
                        "AND",
                        ["status", "anyof", "SalesOrd:D", "SalesOrd:B"],
                        "AND",
                        ["custbody_wave_ready", "is", "F"],
                        "AND",
                        ["custbody_wmsse_ordertype", "anyof", "2"],
                        "AND",
                        ["custcol_ch_psg_se_001", "is", "T"],
                        "AND",
                        ["custcol_wms_order_type", "is", "F"],
                        "AND",
                        ["count(location)", "greaterthan", "1"]
                    ],
                columns:
                    [
                        search.createColumn({
                            name: "internalid",
                            summary: "GROUP",
                            label: "Internal ID"
                        }),
                        search.createColumn({
                            name: "location",
                            summary: "COUNT",
                            label: "Location"
                        })
                    ]
            }).runPaged({ pageSize: 1000 });
        }

        function getWaveItemsFromRecord(waveId) {

            const soItemMap = {};

            const waveRec = record.load({
                type: record.Type.WAVE,
                id: waveId,
                isDynamic: false
            });

            const lineCount = waveRec.getLineCount({ sublistId: 'lineitems' });

            const soId = waveRec.getSublistValue({
                sublistId: 'waveorders',
                fieldId: 'ordernumberid',
                line: 0
            });

            for (let i = 0; i < lineCount; i++) {

                const itemId = waveRec.getSublistValue({
                    sublistId: 'lineitems',
                    fieldId: 'itemid',
                    line: i
                });

                if (!soId || !itemId) continue;

                if (!soItemMap[soId]) {
                    soItemMap[soId] = [];
                }

                soItemMap[soId].push(itemId);
            }

            return soItemMap;
        }

        function updateSOLines(salesOrderId, lineKeys, location) {

            const soRec = record.load({
                type: record.Type.SALES_ORDER,
                id: salesOrderId,
                isDynamic: false
            });

            const lineCount = soRec.getLineCount({ sublistId: 'item' });

            for (let i = 0; i < lineCount; i++) {

                const item_id = Number(soRec.getSublistValue({
                    sublistId: 'item',
                    fieldId: 'item',
                    line: i
                }));

                const location_ = soRec.getSublistValue({
                    sublistId: 'item',
                    fieldId: 'location',
                    line: i
                });

                const back_ord_qty = soRec.getSublistValue({
                    sublistId: 'item',
                    fieldId: 'quantitybackordered',
                    line: i
                });

                if (lineKeys.includes(item_id) && location_ === location && !back_ord_qty) {

                    soRec.setSublistValue({
                        sublistId: 'item',
                        fieldId: 'custcol_wms_order_type',
                        line: i,
                        value: true
                    });
                }
            }

            soRec.save({
                enableSourcing: false,
                ignoreMandatoryFields: true
            });
        }

        function createWave(salesOrderId, waveTemplateId, search) {
            var k = 0;
            const salesorderSearchObj = search.create({
                type: "salesorder",
                settings: [{ "name": "consolidationtype", "value": "ACCTTYPE" }],
                filters:
                    [
                        ["type", "anyof", "SalesOrd"],
                        "AND",
                        ["internalid", "anyof", salesOrderId],
                        "AND",
                        ["location", "anyof", "13", "14", "16", "17", "18", "19", "6", "20", "7", "21", "106", "103"],
                        "AND",
                        ["custbody_ch_mto_order", "is", "F"],
                        "AND",
                        ["status", "anyof", "SalesOrd:D", "SalesOrd:B"],
                        "AND",
                        ["custbody_wave_ready", "is", "F"],
                        "AND",
                        ["custcol_wms_order_type", "is", "F"],
                        "AND",
                        ["custbody_wmsse_ordertype", "anyof", "2"],
                        "AND",
                        ["custcol_ch_psg_se_001", "is", "T"]
                    ],
                columns:
                    [
                        search.createColumn({
                            name: "location",
                            summary: "GROUP",
                            label: "Location"
                        })
                    ]
            });
            const searchResultCount = salesorderSearchObj.runPaged().count;
            log.debug("salesorderSearchObj result count", searchResultCount);
            salesorderSearchObj.run().each(function (result) {
                k = k + 1;
                log.debug('k', k);

                const locationId = result.getValue({
                    name: "location",
                    summary: "GROUP",
                    label: "Location"
                });

                log.debug('locationId', locationId);

                markSO(salesOrderId, true);

                const wave = record.create({
                    type: record.Type.WAVE,
                    isDynamic: true
                });

                let pickType = 'MULTI';
                if (locationId && locationId === '103') {
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

                let waveId = wave.save();
                log.debug('Wave Created', `SO: ${salesOrderId}, Wave: ${waveId}`);

                const soLineMap = getWaveItemsFromRecord(waveId);
                log.debug('soLineMap', soLineMap);


                for (let soId in soLineMap) {
                    updateSOLines(soId, soLineMap[soId], locationId);
                }

                markSO(salesOrderId, false);

                if (k < searchResultCount) {
                    markWmsOrderTypeAsReadyForWaving(salesOrderId);
                }
                return true;
            });

        }

        function processWaves(params) {
            const pagedData = getSalesOrders();
            const totalPages = pagedData.pageRanges.length;
            log.debug('totalPages', totalPages);

            pagedData.pageRanges.forEach((pageRange, pageIndex) => {


                const page = pagedData.fetch({ index: pageRange.index });
                const pageCount = Number(page.pagedData.count);
                log.debug('pageCount', pageCount);

                page.data.forEach((result) => {


                    const salesOrderId = result.getValue({
                        name: "internalid",
                        summary: "GROUP",
                        label: "Internal ID"
                    });

                    try {

                        log.debug('Processing SO', salesOrderId);
                        createWave(salesOrderId, params.waveTemplateId, search);

                    } catch (err) {

                        log.error(`Error SO ${salesOrderId}`, err.message);

                        try {
                            markSO(salesOrderId, false);
                        } catch (cleanupErr) {
                            log.error('Cleanup Failed for' + salesOrderId, cleanupErr.message);
                        }
                    }
                });
            });
        }

        function execute(context) {

            try {

                const params = getParameters();

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