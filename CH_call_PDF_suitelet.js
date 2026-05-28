/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */
define(['N/record', 'N/url', 'N/runtime', 'N/log'],
    (record, url, runtime, log) => {

        const onRequest = (context) => {
            const request = context.request;

            log.audit('SUITELET STARTED', {
                script: runtime.getCurrentScript().id,
                deployment: runtime.getCurrentScript().deploymentId,
                parameters: request.parameters
            });

            const waveId = request.parameters.waveid;
            const waveIds = request.parameters.waveids;
            log.audit('WaveIDs Received', {
                waveId,
                waveIds
             });           

            try {
                const baseUrl = url.resolveScript({
                    scriptId: 'customscriptch_combined_wave_pdf_print',
                    deploymentId: 'customdeploych_combined_wave_pdf_print',
                    returnExternalUrl: false
                });

                if (waveIds) {
                    const ids = String(waveIds)
                        .split(',')
                        .map(id => id.trim())
                        .filter(Boolean);

                    const allClasses = [];
                    const classObj = {};

                    ids.forEach(id => {
                        try {
                            const waveRec = record.load({
                                type: record.Type.WAVE,
                                id,
                                isDynamic: false
                            });

                            updatePrintRemark(waveRec);

                            const classArry = getWaveSalesOrderLineClasses(waveRec);

                            classArry.forEach(cls => {
                                if (cls && !classObj[cls]) {
                                    classObj[cls] = true;
                                    allClasses.push(cls);
                                }
                            });

                        } catch (e) {
                            log.error('Bulk Wave Error for Wave ' + id, e);
                        }
                    });

                    let targetUrl =
                        baseUrl +
                        '&waveids=' + encodeURIComponent(ids.join(','));

                    if (allClasses.length === 1) {
                        targetUrl += '&class=' + encodeURIComponent(allClasses[0]);
                    }

                    log.audit('Bulk Final PDF URL', targetUrl);
                    redirectSameWindow(context.response, targetUrl);
                    return;
                }

                if (!waveId) {
                    context.response.write('No Wave Selected');
                    return;
                }

                const waveRec = record.load({
                    type: record.Type.WAVE,
                    id: waveId,
                    isDynamic: false
                });

                updatePrintRemark(waveRec);

                const classArry = getWaveSalesOrderLineClasses(waveRec);

                let targetUrl =
                    baseUrl +
                    '&recid=' + encodeURIComponent(waveId);

                if (classArry.length === 1) {
                    targetUrl += '&class=' + encodeURIComponent(classArry[0]);
                }

                log.audit('Single Final PDF URL', targetUrl);
                redirectSameWindow(context.response, targetUrl);

            } catch (error) {
                log.error('ERROR IN WAVE PRINT SUITELET', error);
                context.response.write('Error: ' + error.message);
            }
        };

        function getWaveSalesOrderLineClasses(waveRec) {
            const classArry = [];
            const classObj = {};

            const wavetype = String(
                waveRec.getText('wavetype') ||
                waveRec.getValue('wavetype') ||  ''
            );

            let recType = record.Type.SALES_ORDER;

            if (wavetype.toLowerCase().indexOf('transfer') >= 0) {
                recType = record.Type.TRANSFER_ORDER;
            }

            const lineCount = waveRec.getLineCount({
                sublistId: 'picktasks'
            });

            const orderCache = {};

            for (let i = 0; i < lineCount; i++) {
                let itemId = '';
                let orderId = '';

                try {
                    itemId = waveRec.getSublistValue({
                        sublistId: 'picktasks',
                        fieldId: 'itemid',
                        line: i
                    }) || '';
                } catch (e) { }

                try {
                    orderId = waveRec.getSublistValue({
                        sublistId: 'picktasks',
                        fieldId: 'ordernumber',
                        line: i
                    }) || '';
                } catch (e) { }

                if (!itemId || !orderId) {
                    continue;
                }

                if (!orderCache[orderId]) {
                    try {
                        orderCache[orderId] = record.load({
                            type: recType,
                            id: orderId,
                            isDynamic: false
                        });
                    } catch (e) {
                        log.error('Order Load Error', {
                            orderId,
                            recType,
                            error: e
                        });
                        continue;
                    }
                }

                const orderRec = orderCache[orderId];

                const soLineCount = orderRec.getLineCount({
                    sublistId: 'item'
                });
                
                for (let x = 0; x < soLineCount; x++) {
                    const soItem = orderRec.getSublistValue({
                        sublistId: 'item',
                        fieldId: 'item',
                        line: x
                    });

                    if (String(soItem) === String(itemId)) {
                        const productClass = orderRec.getSublistText({
                            sublistId: 'item',
                            fieldId: 'class',
                            line: x
                        }) || '';

                        log.debug('SO Line Class', {
                            itemId,
                            orderId,
                            productClass
                        });

                        if (productClass && !classObj[productClass]) {
                            classObj[productClass] = true;
                            classArry.push(productClass);
                        }

                        break;
                    }
                }
            }

            return classArry;
        }

        function updatePrintRemark(waveRec) {
            const now = new Date();

            const formattedDate =
                now.getDate() + '/' +
                (now.getMonth() + 1) + '/' +
                now.getFullYear() + ' ' +
                now.toLocaleTimeString();

            const currentUser = runtime.getCurrentUser().name;

            waveRec.setValue({
                fieldId: 'custbody_wave_print_remark',
                value: 'Printed by ' + currentUser + ' on ' + formattedDate
            });

            waveRec.save();
        }

        function redirectSameWindow(response, targetUrl) {
            const html = `
                <html>
                <body>
                <script>
                    window.location.href = ${JSON.stringify(targetUrl)};
                </script>
                </body>
                </html>
            `;

            response.write(html);
        }

        return {
            onRequest
        };
    });
