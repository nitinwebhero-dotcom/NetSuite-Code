/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 */

define(['N/search','N/record','N/log'], (search, record, log) => {

    function execute(context) {

        try {

            // Search Waves with Released or In Progress status
            var waveSearch = search.create({
                type: 'wave',
                filters: [
                    ['status','anyof',"Wave:B","WorkOrd:D"]
                ],
                columns: ['internalid']
            });

            waveSearch.run().each(function(result){

                var waveId = result.getValue('internalid');
                log.debug('Processing Wave', waveId);

                try {

                    // record.delete({
                    //     type: 'wave',
                    //     id: waveId
                    // });

                    log.debug('Wave Deleted', waveId);

                } catch(e) {
                    log.error('Unable to delete wave ' + waveId, e.message);
                }

                return true;
            });

        } catch(e) {
            log.error('Script Error', e);
        }

    }

    return { execute };

});
