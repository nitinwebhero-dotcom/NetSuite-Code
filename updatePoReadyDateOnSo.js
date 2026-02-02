/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 */
define(['N/search', 'N/record', 'N/log'], function (search, record, log) {

    function afterSubmit(context) {
        try {
            log.debug('context', context);
            let poId = context.newRecord.id;
            let poRecord = record.load({
                type: record.Type.PURCHASE_ORDER,
                id: poId,
                isDynamic: false
            });
            let poReadyDate = poRecord.getValue({
                fieldId: 'custbody_ch_po_ready_date'
            });
            log.debug('poReadyDate', poReadyDate);
            let createdFromSoId = poRecord.getValue({
                fieldId: 'createdfrom'
            });
            log.debug('createdFromSoId', createdFromSoId);
            if (createdFromSoId) {

                let poIds = [];
                let poReadyDates;

                var salesorderSearchObj = search.create({
                    type: "salesorder",
                    settings: [{ "name": "consolidationtype", "value": "ACCTTYPE" }],
                    filters:
                        [
                            ["type", "anyof", "SalesOrd"],
                            "AND",
                            ["internalid", "anyof", createdFromSoId],
                            "AND",
                            ["mainline", "is", "T"],
                            "AND",
                            ["custbody_ch_po_ready_dates", "isnotempty", ""]
                        ],
                    columns:
                        [
                            search.createColumn({ name: "custbody_ch_po_so_link_", label: "Linked Multiple Purchase Order" }),
                            search.createColumn({ name: "custbody_ch_po_ready_dates", label: "PO Ready Dates" })
                        ]
                });
                var searchResultCount = salesorderSearchObj.runPaged().count;
                log.debug("salesorderSearchObj result count", searchResultCount);
                salesorderSearchObj.run().each(function (result) {
                    poIds.push(result.getValue({ name: "custbody_ch_po_so_link_", label: "Linked Multiple Purchase Order" }));
                    poReadyDates = result.getValue({ name: "custbody_ch_po_ready_dates", label: "PO Ready Dates" });
                    return true;
                });

                log.debug('poIds56', poIds);
                if (poIds[0]) {
                    poIds = poIds[0].split(",");
                }


                if (poIds.length !== 2) {
                    let poReadyDate_ = getDate(poReadyDate);
                    log.debug('poReadyDate_', poReadyDate_);

                    if (poReadyDates) {
                        poReadyDates = poReadyDates + ', ' + poReadyDate_;
                    } else {
                        poReadyDates = poReadyDate;
                    }

                    if (poIds[0] && Number(poIds[0]) !== poId) {
                        poIds.push(poId);
                        log.debug('poIds74', poIds);
                        record.submitFields({
                            type: record.Type.SALES_ORDER,
                            id: createdFromSoId,
                            values: {
                                custbody_ch_po_so_link_: poIds,
                                custbody_ch_po_ready_dates: poReadyDates
                                //custbody_ch_po_ready_date_ds: poReadyDate[1]
                            },
                            options: {
                                enableSourcing: false,
                                ignoreMandatoryFields: true
                            }
                        });
                        log.debug('poline109');
                    } else {
                        record.submitFields({
                            type: record.Type.SALES_ORDER,
                            id: createdFromSoId,
                            values: {
                                custbody_ch_po_so_link_: poId,
                                custbody_ch_po_ready_dates: poReadyDates
                                //custbody_ch_po_ready_date_ds: poReadyDate[1]
                            },
                            options: {
                                enableSourcing: false,
                                ignoreMandatoryFields: true
                            }
                        });
                        log.debug('line124');
                    }
                }

            }


            function getDate(date) {
                if (!date)
                    return;
                var date = new Date(date)
                var mm = date.getMonth() + 1
                var dd = date.getDate()
                var yy = date.getFullYear()
                var hh = date.getHours()
                var min = date.getMinutes()
                var sec = date.getSeconds()
                return mm + '/' + dd + '/' + yy;
            }

        } catch (error) {
            log.debug('error', error);
        }
    }

    return {
        afterSubmit: afterSubmit
    };
});