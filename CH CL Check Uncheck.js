/**
* @NApiVersion 2.x
* @NScriptType ClientScript
* @NModuleScope Public
*/
define(['N/currentRecord'], function (currentRecord) {

    function pageInit() {

    }

    function checkAll() {
        debugger;
        var rec = currentRecord.get();
        var lineCount = rec.getLineCount({ sublistId: 'item' });

        for (var i = 0; i < lineCount; i++) {
            rec.selectLine({
                sublistId: 'item',
                line: i
            });

            rec.setCurrentSublistValue({
                sublistId: 'item',
                fieldId: 'custcol_ch_psg_se_001', // replace with your field ID
                value: true
            });

            rec.setCurrentSublistValue({
                sublistId: 'item',
                fieldId: 'commitmentfirm', // replace with your field ID
                value: true
            });

            rec.commitLine({
                sublistId: 'item'
            });
            // var itemId = rec.setCurrentSublistValue({
            //     sublistId: 'item',
            //     fieldId: 'custcol_ch_psg_se_001',
            //     value: true
            // });
            // Do something with each item line
        }

        alert('Custom action complete!');
    }

    
    function uncheckAll() {
        debugger;
        var rec = currentRecord.get();
        var lineCount = rec.getLineCount({ sublistId: 'item' });

        for (var i = 0; i < lineCount; i++) {
            rec.selectLine({
                sublistId: 'item',
                line: i
            });

            rec.setCurrentSublistValue({
                sublistId: 'item',
                fieldId: 'custcol_ch_psg_se_001', // replace with your field ID
                value: false
            });

            rec.setCurrentSublistValue({
                sublistId: 'item',
                fieldId: 'commitmentfirm', // replace with your field ID
                value: false
            });

            rec.commitLine({
                sublistId: 'item'
            });
            // var itemId = rec.setCurrentSublistValue({
            //     sublistId: 'item',
            //     fieldId: 'custcol_ch_psg_se_001',
            //     value: true
            // });
            // Do something with each item line
        }

        alert('Custom action complete!');
    }

    return {
        pageInit: pageInit,
        checkAll: checkAll,
        uncheckAll:uncheckAll
    };
});