/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 */
define(['N/record', 'N/render', 'N/file', 'N/log', 'N/search'], (record, render, file, log, search) => {

    const MAX_BULK = 10;

    const onRequest = (context) => {
        try {
            const params = context.request.parameters;
            const waveId = params.waveid || params.recid || '';
            const waveIds = params.waveids || '';
            const selectedClass = params.class || '';
            const selectedClassKey = norm(selectedClass);

            let ids = [];

            if (waveIds) {
                ids = waveIds.split(',').map(x => x.trim()).filter(Boolean);
            } else if (waveId) {
                ids = [waveId];
            }

            ids = [...new Set(ids)];

            if (!ids.length) {
                context.response.write('No Wave Selected');
                return;
            }

            if (ids.length > MAX_BULK) {
                context.response.write('Maximum 10 Waves Allowed');
                return;
            }

            let logoUrl = '';

            try {
                const logo = file.load({
                    id: 'Images/Classic Home.png'
                });

                logoUrl = esc(logo.url);
            } catch (e) {
                log.error('Logo Error', e);
            }

            let html = [];
            let printedPageCount = 0;

            ids.forEach((waveInternalId) => {
                try {
                    const waveRec = record.load({
                        type: record.Type.WAVE,
                        id: waveInternalId,
                        isDynamic: false
                    });

                    const waveData = getWaveData(waveRec);
                    log.audit('waveData',waveData);
                    const soId = getWaveOrderId(waveRec);
                    log.audit('soId',soId);

                    let recType = record.Type.SALES_ORDER;

                    if (waveData.wavetype.toLowerCase().indexOf('transfer') >= 0) {
                        recType = record.Type.TRANSFER_ORDER;
                    }

                    let soRec = null;

                    if (soId) {
                        soRec = record.load({
                            type: recType,
                            id: soId,
                            isDynamic: false
                        });
                    }

                    const orderData = getOrderData(soRec);
                    log.debug('orderData',orderData);

                    let classGroups = getWaveClassGroups(waveRec, soRec);
                    log.debug('classGroups',classGroups);

                    if (selectedClassKey) {
                        const matchedGroup = classGroups.find(group =>
                            classMatches(selectedClassKey, group.classText, group.classId)
                        );

                        classGroups = matchedGroup ? [matchedGroup] : [{
                            classText: selectedClass,
                            classId: '',
                            entries: []
                        }];
                    }

                    if (!classGroups.length) {
                        classGroups = [{
                            classText: 'No Class',
                            classId: '',
                            entries: getAllWaveEntries(waveRec)
                        }];
                    }

                    classGroups.forEach((classGroup) => {
                        if (printedPageCount > 0) {
                            html.push('<pbr/>');
                        }

                        printClassTicket({
                            html,
                            logoUrl,
                            waveRec,
                            soRec,
                            waveData,
                            orderData,
                            classGroup
                        });

                        printedPageCount++;
                    });

                } catch (e) {
                    log.error('Wave Error', e);

                    if (printedPageCount > 0) {
                        html.push('<pbr/>');
                    }

                    html.push(`
                        <table border="1">
                        <tr><td>Error Loading Wave</td></tr>
                        </table>
                    `);

                    printedPageCount++;
                }
            });

            const xml = `<?xml version="1.0"?>
                <!DOCTYPE pdf PUBLIC "-//big.faceless.org//report" "report-1.1.dtd">
                <pdf>
                <head>
                <style>
                body {
                    font-family: Helvetica;
                    font-size: 10pt;
                }

                table {
                    border-collapse: collapse;
                }

                td, th {
                    padding: 3px;
                    word-wrap: break-word;
                }

                th {
                    background-color: #d9d9d9;
                    font-weight: bold;
                    text-align: center;
                }
                </style>
                </head>

                <body size="A4-landscape" padding="0.25in">
                ${html.join('')}
                </body>
                </pdf>`;

            const pdf = render.xmlToPdf({
                xmlString: xml
            });

            context.response.writeFile(pdf, true);

        } catch (e) {
            log.error('MAIN ERROR', e);
            context.response.write('Error: ' + e.message);
        }
    };

    function printClassTicket(options) {
        const html = options.html;
        const logoUrl = options.logoUrl;
        const waveRec = options.waveRec;
        const soRec = options.soRec;
        const waveData = options.waveData;
        const orderData = options.orderData;
        const classGroup = options.classGroup;
        log.audit('classGroup',classGroup);

        const displayClass = classGroup.classText || 'No Class';
        log.debug('displayClass',displayClass);

        html.push(`
            <table width="100%">
            <tr>
            <td align="center">
            ${logoUrl ? `<img src="${logoUrl}" width="220" height="45"/>` : ''}
            </td>
            </tr>

            <tr>
            <td align="center" style="font-size:26pt;">
            <b>Pick Ticket</b>
            </td>
            </tr>

            <tr>
            <td align="center">Created: ${esc(waveData.created)}</td>
            </tr>

            <tr>
            <td align="center">Class: ${esc(displayClass)}</td>
            </tr>
            </table>

            <br/><br/>
        `);

        html.push(`
            <table width="100%">
            <tr>
            <td width="50%" valign="top" style="font-size:9pt;" align="left">
            <b>Billing Address:</b><br/>
            ${esc(orderData.billAddress)}
            </td>

            <td width="50%" valign="top" style="font-size:9pt;" align="left">
            <b>Shipping Address:</b><br/>
            ${esc(orderData.shipAddress)}
            </td>
            </tr>
            </table>

            <br/><br/>
        `);

        html.push(`
            <table width="100%">
            <tr>
            <td width="50%" align="left">
            Wave #<br/>
            <barcode codetype="code128" showtext="true" value="${safeBarcode(waveData.waveNo)}" width="160" height="35" />

            <br/><br/>

            Order #<br/>
            <barcode codetype="code128" showtext="true" value="${safeBarcode(orderData.tranid)}" width="160" height="35"/>
            </td>

            <td width="50%" align="left">
            Customer Id<br/>
            <barcode codetype="code128" showtext="true" value="${safeBarcode(orderData.custId)}" width="160" height="35"/>

            <br/>

            Customer Name: ${esc(orderData.customer)}<br/>
            Terms: ${esc(orderData.terms)}

            <br/><br/>

            Customer PO<br/>
            <barcode codetype="code128" showtext="true" value="${safeBarcode(orderData.po)}" width="160" height="35"/>
            </td>
            </tr>
            </table>

            <br/>
        `);

        html.push(`
            <table width="50%" style="font-size:10pt;" margin-top="-10px;">
            <tr><td>EDI Customer Order#: ${esc(orderData.spsOrderNumber)}</td></tr>
            <tr><td>Customer Phone: ${esc(orderData.phone)}</td></tr>
            <tr><td>Order Source: ${esc(orderData.orderSource)}</td></tr>
            <tr><td>Business Unit: ${esc(orderData.businessUnit)}</td></tr>
            <tr><td>Request Ship Date: ${esc(orderData.reqShipDate)}</td></tr>
            <tr><td>Email: ${esc(orderData.email)}</td></tr>
            <tr><td>Shipping Instructions: ${esc(orderData.instruction)}</td></tr>
            </table>

            <br/>
        `);

        html.push(`
            <table width="100%" border="1px" style="font-size:8pt; border-collapse:collapse; table-layout:fixed;">
            <tr>
            <th width="6%" border-right="1px">Item</th>
            <th width="16%" border-right="1px">Description</th>
            <th width="5%" border-right="1px">Pick Qty</th>
            <th width="7%" border-right="1px">Bin</th>
            <th width="5%" border-right="1px">Status</th>
            <th width="5%" border-right="1px">Cubes</th>
            <th width="5%" border-right="1px">Weight</th>
            <th width="8%" border-right="1px">Account Specialist</th>
            <th width="7%" border-right="1px">Location</th>
            <th width="8%" border-right="1px">Ship Via</th>
            <th width="5%" border-right="1px">SCAC</th>
            <th width="12%" border-right="1px">Side Marks</th>
            <th width="10%">Stocking Dealer Price</th>
            </tr>
        `);

        let totalCube = 0;
        let totalWeight = 0;
        let totalPrice = 0;
        let printedLineCount = 0;

        classGroup.entries.forEach((entry) => {
            const line = entry.waveLine;
            const soLine = entry.soLine;
            

            const itemId = safeWaveLineValue(waveRec, 'picktasks', 'itemid', line);
            const item = safeWaveLineText(waveRec, 'picktasks', 'item', line);
            const qty = getWaveLineNumber(waveRec, 'picktasks', 'quantity', line);
            const bin = getRecommendedBin(waveRec, line);
            const status_ = getBinInventoryStatus(waveRec, line);
           

            let desc = '';
            let cubes = 0;
            let weight = 0;
            let stockingDealerPrice = 0;
            let scac = '';
            let sideMark = '';
            let specialist = '';

            if (soRec && soLine >= 0) {
                desc = safeLineValue(soRec, 'description', soLine);
                cubes = getLineNumber(soRec, 'custcol_ch_so_wms_ipw_002', soLine) * qty;
                weight = getLineNumber(soRec, 'custcol_ch_so_wms_ipw_001', soLine) * qty;
                stockingDealerPrice = getLineNumber(soRec, 'custcol_ch_wms_ship_rate_0001', soLine) * qty;
                scac = safeLineValue(soRec, 'custcol_ch_so_scac', soLine);
                sideMark = safeLineValue(soRec, 'custcol_sps_gen_noteinformationfield', soLine);
                specialist = safeBodyText(soRec, 'custbody_ch_so_acc_spec');
            }

            totalCube += cubes;
            totalWeight += weight;
            totalPrice += stockingDealerPrice;
            printedLineCount++;

            html.push(`
                <tr border="1px">
                <td valign="top" border-right="1px">${esc(item)}</td>
                <td valign="top"  border-right="1px">${esc(desc)}</td>
                <td align="center" valign="top"  border-right="1px">${qty}</td>
                <td valign="top"  border-right="1px">${esc(bin)}</td>
                <td align="center" valign="top"  border-right="1px">${esc(status_)}</td>
                <td align="right" valign="top"  border-right="1px">${cubes.toFixed(2)}</td>
                <td align="right" valign="top"  border-right="1px">${weight.toFixed(2)}</td>
                <td valign="top"  border-right="1px">${esc(specialist)}</td>
                <td valign="top"  border-right="1px">${esc(waveData.location)}</td>
                <td valign="top"  border-right="1px">${esc(orderData.shipMethod)}</td>
                <td valign="top"  border-right="1px">${esc(scac)}</td>
                <td valign="top"  border-right="1px">${esc(sideMark)}</td>
                <td align="right" valign="top" >${stockingDealerPrice.toFixed(2)}</td>
                </tr>
            `);
        });

        if (!printedLineCount) {
            html.push(`
                <tr>
                <td colspan="13" align="center">
                No items found for ${esc(displayClass)}
                </td>
                </tr>
            `);
        }

        html.push(`
            <tr style="font-size:9pt;">
            <td colspan="5" align="right" border-right="1px"><b>Total</b></td>
            <td align="right" border-right="1px">${totalCube.toFixed(2)}</td>
            <td align="right" border-right="1px">${totalWeight.toFixed(2)}</td>
            <td colspan="5"></td>
            <td align="right">${totalPrice.toFixed(2)}</td>
            </tr>
            </table>
        `);
    }

    function getRecommendedBin(waveRec, line) {
        const possibleFieldIds = [
            'recommendedbin',
            'recommendedBin',
            'bin',
            'binnumber',
            'frombin',
            'stagingbin'
        ];

        for (let i = 0; i < possibleFieldIds.length; i++) {
            const fieldId = possibleFieldIds[i];

            const textValue = safeWaveLineText(waveRec, 'picktasks', fieldId, line);
            if (textValue) return textValue;

            const valueValue = safeWaveLineValue(waveRec, 'picktasks', fieldId, line);
            if (valueValue) return valueValue;
        }

        return '';
    }

    function getBinInventoryStatus(waveRec, line) {
        const binId = safeWaveLineValue(waveRec, 'picktasks', 'binid', line);
        const pickTaskId = safeWaveLineValue(waveRec, 'picktasks', 'picktaskid', line);
        

        if (!binId || !pickTaskId) {
        return '';
        }

        try {
        const pickTaskRec = record.load({
            type: 'picktask',
            id: pickTaskId,
            isDynamic: false
        });

        const binLineCount = pickTaskRec.getLineCount({
            sublistId: 'bins'
        });

        for (let i = 0; i < binLineCount; i++) {
            const pickTaskBinId = safeWaveLineValue(pickTaskRec, 'bins', 'binid', i);

            if (String(pickTaskBinId) === String(binId)) {
                return (
                    safeWaveLineText(pickTaskRec, 'bins', 'inventorystatus', i) ||
                    safeWaveLineValue(pickTaskRec, 'bins', 'inventorystatus', i)
                );
            }
        }
        } catch (e) {
        log.error('Bin Inventory Status Error', {
            pickTaskId: pickTaskId,
            binId: binId,
            error: e
        });
        }

        return '';
    }


    function getWaveClassGroups(waveRec, soRec) {
        const groups = [];
        const groupMap = {};

        const lineCount = waveRec.getLineCount({
            sublistId: 'picktasks'
        });

        for (let i = 0; i < lineCount; i++) {
            const itemId = safeWaveLineValue(waveRec, 'picktasks', 'itemid', i);
            const match = findSoLineForWaveLine(waveRec, soRec, i, itemId, '');

            const soLine = match ? match.line : -1;
            const classText = match ? safeLineText(soRec, 'class', soLine) : '';
            const classId = match ? safeLineValue(soRec, 'class', soLine) : '';

            const key = norm(classId) || norm(classText) || 'no_class';

            if (!groupMap[key]) {
                groupMap[key] = {
                    classText: classText || 'No Class',
                    classId: classId,
                    entries: []
                };

                groups.push(groupMap[key]);
            }

            groupMap[key].entries.push({
                waveLine: i,
                soLine: soLine
            });
        }

        return groups;
    }

    function findSoLineForWaveLine(waveRec, soRec, waveLine, itemId, classKey) {
        if (!soRec || !itemId) return null;

        const soLineCount = soRec.getLineCount({
            sublistId: 'item'
        });

        const waveKeys = getWaveLineKeys(waveRec, waveLine);
        let firstCandidate = null;

        for (let x = 0; x < soLineCount; x++) {
            const soItem = safeLineValue(soRec, 'item', x);

            if (String(soItem) !== String(itemId)) {
                continue;
            }

            const classText = safeLineText(soRec, 'class', x);
            const classId = safeLineValue(soRec, 'class', x);

            if (classKey && !classMatches(classKey, classText, classId)) {
                continue;
            }

            if (firstCandidate === null) {
                firstCandidate = x;
            }

            const soKeys = getSoLineKeys(soRec, x);

            if (hasCommonValue(waveKeys, soKeys)) {
                return {
                    line: x
                };
            }
        }

        if (firstCandidate !== null) {
            return {
                line: firstCandidate
            };
        }

        return null;
    }

    function getWaveLineKeys(waveRec, line) {
        return cleanList([
            safeWaveLineValue(waveRec, 'picktasks', 'orderline', line),
            safeWaveLineValue(waveRec, 'picktasks', 'line', line),
            safeWaveLineValue(waveRec, 'picktasks', 'lineid', line),
            safeWaveLineValue(waveRec, 'picktasks', 'transactionline', line),
            safeWaveLineValue(waveRec, 'picktasks', 'transactionlineid', line),
            safeWaveLineValue(waveRec, 'picktasks', 'lineuniquekey', line)
        ]);
    }

    function getSoLineKeys(soRec, line) {
        return cleanList([
            safeLineValue(soRec, 'line', line),
            safeLineValue(soRec, 'lineuniquekey', line),
            safeLineValue(soRec, 'orderline', line),
            safeLineValue(soRec, 'id', line)
        ]);
    }

    function hasCommonValue(listA, listB) {
        for (let i = 0; i < listA.length; i++) {
            for (let x = 0; x < listB.length; x++) {
                if (String(listA[i]) === String(listB[x])) {
                    return true;
                }
            }
        }

        return false;
    }

    function cleanList(values) {
        return values
            .map(value => String(value || '').trim())
            .filter(Boolean);
    }

    function getAllWaveEntries(waveRec) {
        const entries = [];
        const lineCount = waveRec.getLineCount({
            sublistId: 'picktasks'
        });

        for (let i = 0; i < lineCount; i++) {
            entries.push({
                waveLine: i,
                soLine: -1
            });
        }

        return entries;
    }

    function getWaveData(waveRec) {
        return {
            waveNo: safeBodyValue(waveRec, 'name'),
            location: safeBodyText(waveRec, 'location'),
            created: formatOnlyDate(safeBodyRawValue(waveRec, 'createddate')),
            wavetype: safeBodyText(waveRec, 'wavetype'),
            status: safeBodyText(waveRec, 'status'),
            picktype: safeBodyText(waveRec, 'picktype')
        };
    }

    function getWaveOrderId(waveRec) {
        let soId = '';

        try {
            soId = waveRec.getSublistValue({
                sublistId: 'picktasks',
                fieldId: 'ordernumber',
                line: 0
            }) || '';
        } catch (e) { }

        if (!soId) {
            try {
                soId = waveRec.getSublistValue({
                    sublistId: 'lineitems',
                    fieldId: 'ordernumber',
                    line: 0
                }) || '';
            } catch (e) { }
        }

        return soId;
    }

    function getOrderData(soRec) {
        const data = {
            billAddress: '',
            shipAddress: '',
            customer: '',
            terms: '',
            po: '',
            tranid: '',
            custId: '',
            shipMethod: '',
            spsOrderNumber:'',
            reqShipDate: '',
            orderSource: '',
            businessUnit: '',
            email: '',
            phone: '',
            instruction: ''
        };

        if (!soRec) return data;

        data.tranid = safeBodyValue(soRec, 'tranid');
        data.billAddress = safeBodyValue(soRec, 'billaddress');
        data.shipAddress = safeBodyValue(soRec, 'shipaddress');
        const custName = safeBodyText(soRec, 'entity');
        const customerInternalId = safeBodyValue(soRec, 'entity');
        const customerDetails = getCustomerDetails(customerInternalId);
        
        data.customer = customerDetails.name || '';
        data.custId = customerDetails.entityId || '';

        data.terms = safeBodyText(soRec, 'terms');
        data.po = safeBodyValue(soRec, 'otherrefnum');
        data.shipMethod = safeBodyText(soRec, 'shipmethod');
        data.spsOrderNumber = safeBodyValue(soRec,'custbody_sps_customerordernumber');
        

        data.reqShipDate = formatOnlyDate(safeBodyRawValue(soRec, 'custbody_sps_date_010'));
        data.orderSource = safeBodyText(soRec, 'custbody_ch_om_ordersource');
        data.businessUnit = safeBodyText(soRec, 'cseg1');
        data.email = safeBodyValue(soRec, 'custbody_ch_primary_email');

        data.phone =
            safeBodyValue(soRec, 'custbody_ch_wms_po_num_002') ||
            safeBodyValue(soRec, 'custbody_ch_cust_po_num_001');

        data.instruction = safeBodyValue(soRec, 'custbody_ch_so_cust_delivery_instruc');

        return data;
    }


    function getCustomerDetails(customerInternalId) {
        const details = {
            entityId: '',
            name: ''
        };

        if (!customerInternalId) return details;

        try {
            const lookup = search.lookupFields({
                type: search.Type.CUSTOMER,
                id: customerInternalId,
                columns: ['entityid', 'altname']
            });

            details.entityId = val(lookup.entityid);
            details.name = val(lookup.altname);
        } catch (e) {
            log.error('Customer Details Lookup Error', e);
        }

        return details;
    }

    function safeBodyRawValue(rec, fieldId) {
        try {
            return rec.getValue({
                fieldId: fieldId
            });
        } catch (e) {
            return '';
        }
    }

    function safeBodyValue(rec, fieldId) {
        return val(safeBodyRawValue(rec, fieldId));
    }

    function safeBodyText(rec, fieldId) {
        try {
            return val(rec.getText({
                fieldId: fieldId
            }));
        } catch (e) {
            return '';
        }
    }

    function safeLineValue(rec, fieldId, line) {
        try {
            return val(rec.getSublistValue({
                sublistId: 'item',
                fieldId: fieldId,
                line: line
            }));
        } catch (e) {
            return '';
        }
    }

    function safeLineText(rec, fieldId, line) {
        try {
            return val(rec.getSublistText({
                sublistId: 'item',
                fieldId: fieldId,
                line: line
            }));
        } catch (e) {
            return '';
        }
    }

    function safeWaveLineValue(rec, sublistId, fieldId, line) {
        try {
            return val(rec.getSublistValue({
                sublistId: sublistId,
                fieldId: fieldId,
                line: line
            }));
        } catch (e) {
            return '';
        }
    }

    function safeWaveLineText(rec, sublistId, fieldId, line) {
        try {
            return val(rec.getSublistText({
                sublistId: sublistId,
                fieldId: fieldId,
                line: line
            }));
        } catch (e) {
            return '';
        }
    }

    function getLineNumber(rec, fieldId, line) {
        try {
            const raw = rec.getSublistValue({
                sublistId: 'item',
                fieldId: fieldId,
                line: line
            });

            const num = Number(String(raw || 0).replace(/,/g, ''));
            return isNaN(num) ? 0 : num;
        } catch (e) {
            return 0;
        }
    }

    function getWaveLineNumber(rec, sublistId, fieldId, line) {
        try {
            const raw = rec.getSublistValue({
                sublistId: sublistId,
                fieldId: fieldId,
                line: line
            });

            const num = Number(String(raw || 0).replace(/,/g, ''));
            return isNaN(num) ? 0 : num;
        } catch (e) {
            return 0;
        }
    }

    function classMatches(selectedClassKey, classText, classId) {
        const key = norm(selectedClassKey);

        return key &&
            (
                key === norm(classText) ||
                key === norm(classId)
            );
    }

    function val(v) {
        return v || '';
    }

    function norm(v) {
        return String(v || '').trim().toLowerCase();
    }

    function safeBarcode(v) {
        v = String(v || '').trim();
        return v ? esc(v) : 'NA';
    }

    function esc(v) {
        return String(v || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    function formatOnlyDate(dateValue) {
        if (!dateValue) return '';

        const dt = new Date(dateValue);

        const day = String(dt.getDate()).padStart(2, '0');
        const month = String(dt.getMonth() + 1).padStart(2, '0');
        const year = dt.getFullYear();

        return month + '/' + day + '/' + year;
    }

    return {
        onRequest: onRequest
    };

});
