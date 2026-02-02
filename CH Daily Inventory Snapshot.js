/**
* @NApiVersion 2.x
* @NScriptType MapReduceScript
*/
define(['N/search', 'N/record', 'N/log'], function (search, record, log) {
 
    function getInputData() {
        return search.create({
            type: "inventorybalance",
            filters: [
                ["item", "anyof", "1206", "1137"]
            ],
            columns: [
                search.createColumn({ name: "item", summary: "GROUP" }),
                search.createColumn({ name: "location", summary: "GROUP" }),
                search.createColumn({ name: "onhand", summary: "SUM" }),
                search.createColumn({ name: "available", summary: "SUM" }),
                search.createColumn({ name: "internalid", join: "item", summary: "GROUP" }),
                search.createColumn({ name: "itemid", join: "item", summary: "GROUP" })
            ]
        });
    }
 
    function map(context) {
 
        var result = JSON.parse(context.value);
 
        var data = {
            itemId: result.values["item.internalid"].value,
            itemName: result.values["item.itemid"],
            location: result.values["location"].value,
            onHand: result.values["onhand"],
            available: result.values["available"]
        };
 
        var key = data.itemId + '_' + data.location;
 
        context.write({
            key: key,
            value: data
        });
    }
 
    function reduce(context) {
 
        var data = JSON.parse(context.values[0]);
 
        try {
            var rec = record.create({
                type: 'customrecord_inv_balance_snap',
                isDynamic: true
            });
 
            rec.setValue({ fieldId: 'custrecord_inv_item', value: data.itemId });
            rec.setValue({ fieldId: 'custrecord_inv_location', value: data.location });
            rec.setValue({ fieldId: 'custrecord_inv_onhand', value: data.onHand });
            rec.setValue({ fieldId: 'custrecord_inv_available', value: data.available });
 
            var recId = rec.save();
 
            log.audit('Inventory Snapshot Created', recId);
 
        } catch (e) {
            log.error('Reduce Error', e);
        }
    }
 
    function summarize(summary) {
 
        if (summary.inputSummary.error) {
            log.error('Input Error', summary.inputSummary.error);
        }
 
        summary.mapSummary.errors.iterator().each(function (key, error) {
            log.error('Map Error: ' + key, error);
            return true;
        });
 
        summary.reduceSummary.errors.iterator().each(function (key, error) {
            log.error('Reduce Error: ' + key, error);
            return true;
        });
 
        log.audit('Script Completed', 'Inventory Balance snapshot created');
    }
 
    return {
        getInputData: getInputData,
        map: map,
        reduce: reduce,
        summarize: summarize
    };
});