/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */

define(['N/ui/serverWidget', 'N/search', 'N/url', 'N/log', 'N/runtime'], (ui, search, url, log, runtime) => {
    const PAGE_SIZE = 30;

    const escapeHtml = (value) => {
        return String(value ?? '').replace(/[&<>"']/g, (char) => {
            switch (char) {
                case '&':
                    return '&amp;';
                case '<':
                    return '&lt;';
                case '>':
                    return '&gt;';
                case '"':
                    return '&quot;';
                case '\'':
                    return '&#39;';
                default:
                    return char;
            }
        });
    };

    const buildQueryString = (params) => {
        return Object.keys(params)
            .filter((key) => params[key] !== '' && params[key] !== null && params[key] !== undefined)
            .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
            .join('&');
    };

    const appendParamsToUrl = (baseUrl, params) => {
        const queryString = buildQueryString(params);
        if (!queryString) {
            return baseUrl;
        }

        const separator = baseUrl.indexOf('?') === -1 ? '?' : '&';
        return `${baseUrl}${separator}${queryString}`;
    };

    const formatDateFilterValue = (dateOption) => {
        const parts = String(dateOption || '').split('-');
        if (parts.length !== 3) {
            return '';
        }

        return `${parseInt(parts[1], 10)}/${parseInt(parts[2], 10)}/${parts[0]}`;
    };

    const onRequest = (context) => {
        const form = ui.createForm({ title: 'Daily Wave List' });

        const currentScript = runtime.getCurrentScript();
        const currentSuiteletBaseUrl = url.resolveScript({
            scriptId: currentScript.id,
            deploymentId: currentScript.deploymentId,
            returnExternalUrl: false
        });

        const currentSuiteletUrlParts = currentSuiteletBaseUrl.split('?');
        const currentSuiteletAction = currentSuiteletUrlParts[0];
        const currentSuiteletQuery = currentSuiteletUrlParts[1] || '';

        const routeHiddenInputs = currentSuiteletQuery
            .split('&')
            .filter(Boolean)
            .map((param) => {
                const parts = param.split('=');
                const name = decodeURIComponent(parts.shift() || '');
                const value = decodeURIComponent(parts.join('=') || '');

                return `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`;
            })
            .join('');

        const selectedLocation = String(context.request.parameters.location || '');
        let dateOption = String(context.request.parameters.date || '');

         // ✅ If no date selected → set today's date
        if (!dateOption) {
                const today = new Date();

                const year = today.getFullYear();
                const month = String(today.getMonth() + 1).padStart(2, '0');
                const day = String(today.getDate()).padStart(2, '0');

                dateOption = `${year}-${month}-${day}`;  // format: mm-dd-yyyy
        }

        let page = parseInt(context.request.parameters.page, 10) || 1;
        log.debug('Initial page parameter', page);
        if (page < 1) {
            page = 1;
        }
           
        let locationOptions = '<option value="">All</option>';

        const locationSearch = search.create({
            type: 'location',
            filters: [['isinactive', 'is', 'F']],
            columns: ['internalid', 'name']
        });

        locationSearch.run().each((result) => {
            const id = String(result.getValue('internalid') || '');
            const name = result.getValue('name') || '';
            const selected = id === selectedLocation ? ' selected' : '';

            locationOptions += `<option value="${escapeHtml(id)}"${selected}>${escapeHtml(name)}</option>`;
            return true;
        });

        const filters = [
            ['type', 'anyof', 'Wave'],
            'AND',
            ['status', 'anyof', 'Wave:B'],
            'AND',
            ['custbody_ch_bus_unit', 'isnotempty', ''],
            'AND',
            ['systemnotes.type', 'is', 'T']
        ];

        if (selectedLocation) {
            filters.push('AND', ['location', 'anyof', selectedLocation]);
        }

        if (dateOption) {
            const formattedDate = formatDateFilterValue(dateOption);
            if (formattedDate) {
                filters.push('AND', ['datecreated', 'on', formattedDate]);
            }
        }

    const bulkPrintBaseUrl = url.resolveScript({
    scriptId: 'customscript_ch_call_pdf_suitelet',
    deploymentId: 'customdeploy_ch_call_pdf_suitelet',
    returnExternalUrl: false
    });

    /*===search for waves with filters and group by wave id to get unique waves===*/
        const waveSearch = search.create({
            type: 'wave',
            filters,
            columns: [
                search.createColumn({ name: 'internalid', summary: 'GROUP' }),
                search.createColumn({ name: 'tranid', summary: 'GROUP' }),
                search.createColumn({ name: 'datecreated', summary: 'GROUP' }),
                search.createColumn({ name: 'statusref', summary: 'GROUP' }),
                search.createColumn({ name: 'custbody_ch_bus_unit', summary: 'GROUP' }),
                search.createColumn({ name: 'location', summary: 'GROUP' }),
                search.createColumn({
                    name: 'shipmethod',
                    join: 'appliedToTransaction',
                    summary: 'GROUP'
                }),

                search.createColumn({
                    name: 'custcol_2663_companyname',
                    join: 'appliedToTransaction',
                    summary: 'GROUP'
                }),
                search.createColumn({
                    name: 'name',
                    join: 'systemNotes',
                    summary: 'GROUP'
                }),
                search.createColumn({
                    name: 'custbody_wave_print_remark',
                    summary: 'GROUP'
                })
            ]
        });

        const pagedData = waveSearch.runPaged({ pageSize: PAGE_SIZE });
        const totalPages = pagedData.pageRanges.length;

        if (page > totalPages && totalPages > 0) {
            page = totalPages;
        }

        let results = [];

        if (totalPages > 0) {
            const pageData = pagedData.fetch({ index: page - 1 });
            results = pageData.data;
        }

        let html = `
        <link rel="stylesheet" href="https://www.w3schools.com/w3css/5/w3.css">
        <div class="w3-container" style="padding:0; margin:0;">
            <form method="GET" action="${escapeHtml(currentSuiteletAction)}">
                ${routeHiddenInputs}
                <input type="hidden" name="page" value="1">
            
                <select name="location" style="width:200px; margin-right:10px;">${locationOptions}</select>
                
                <input type="date"
                    name="date"
                    value="${escapeHtml(dateOption)}" style="margin-bottom:15px; width:13.5%; margin-right:10px; padding:3px; border-radius:2px; border:1px solid #ccc;"
                />

                <button type="submit" style="margin-bottom:15px; width:13.5%; margin-right:10px; padding:3px; border-radius:3px; border:1px solid #ccc;">Search</button>
                <button type="button" onclick="bulkPrint()" style="margin-bottom:15px; width:13.5%; margin-right:10px; padding:3px; border-radius:3px; border:1px solid #ccc; background-color: #3878c6; color: white;">Print Selected</button>
            </form>

            <table class="w3-table-all">
                <thead>
                    <tr style="background:#383733; color:white;">
                        <th><input type="checkbox" onclick="toggleAll(this)">Select All</th>
                        <th>Wave</th>
                        <th>Date</th>
                        <th>Status</th>
                        <th>Location</th>
                        <th>BU</th>
                        <th>Customer</th>
                        <th>Ship Via</th>
                        <th>Created By</th>
                        <th>Remark</th>
                        <th>Print</th>
                    </tr>
                </thead>
                <tbody>
        `;

        if (!results.length) {
            html += `
                <tr>
                    <td colspan="11" style="text-align:center;">No waves found.</td>
                </tr>
            `;
        }

        results.forEach((result) => {
            const waveInternalId = result.getValue({ name: 'internalid', summary: 'GROUP' }) || '';
            const waveId = result.getValue({ name: 'tranid', summary: 'GROUP' }) || '';
            const waveDate = result.getValue({ name: 'datecreated', summary: 'GROUP' }) || '';
            const status = result.getText({ name: 'statusref', summary: 'GROUP' }) || '';
            const locationText = result.getText({ name: 'location', summary: 'GROUP' }) || '';
            const shipVia = result.getText({
                name: 'shipmethod',
                join: 'appliedToTransaction',
                summary: 'GROUP'
            }) || result.getValue({
                name: 'shipmethod',
                join: 'appliedToTransaction',
                summary: 'GROUP'
            }) || '';
            const bu = result.getText({ name: 'custbody_ch_bus_unit', summary: 'GROUP' })
                || result.getValue({ name: 'custbody_ch_bus_unit', summary: 'GROUP' })
                || '';
            const customer = result.getValue({
                name: 'custcol_2663_companyname',
                join: 'appliedToTransaction',
                summary: 'GROUP'
            }) || '';
            const createdBy = result.getText({
                name: 'name',
                join: 'systemNotes',
                summary: 'GROUP'
            }) || result.getValue({
                name: 'name',
                join: 'systemNotes',
                summary: 'GROUP'
            }) || '';
            const remark = result.getValue({
                name: 'custbody_wave_print_remark',
                summary: 'GROUP'
            }) || '';

            /*===generate print url for each wave===*/

            const printUrl = url.resolveScript({
                scriptId: 'customscript_ch_call_pdf_suitelet',
                deploymentId: 'customdeploy_ch_call_pdf_suitelet',
                params: { waveid: waveInternalId }
            });

            // const printColumn = remark && remark !== '- None -'
            //     ? '<span style="color:grey;">Printed</span>'
            //     : `<a href="${escapeHtml(printUrl)}" target="_blank" rel="noopener noreferrer">Print</a>`;

             const printColumn = `<a href="${escapeHtml(printUrl)}" target="_blank" rel="noopener noreferrer">Print</a>`;

            html += `
                <tr>
                    <td>${`<input type="checkbox" class="waveCheckbox" value="${escapeHtml(waveInternalId)}">`}
                    </td>
                    <td>${escapeHtml(waveId)}</td>
                    <td>${escapeHtml(waveDate)}</td>
                    <td>${escapeHtml(status)}</td>
                    <td>${escapeHtml(locationText)}</td>
                    <td>${escapeHtml(bu)}</td>
                    <td>${escapeHtml(customer)}</td>
                    <td>${escapeHtml(shipVia)}</td>
                    <td>${escapeHtml(createdBy)}</td>
                    <td>${escapeHtml(remark)}</td>
                    <td>${printColumn}</td>
                </tr>
            `;
        });

        html += `
                </tbody>
            </table>
            <br/>
        `;

        html += '<div style="margin-top:15px; font-size:16px;">';

        if (page > 1) {
            const prevUrl = appendParamsToUrl(currentSuiteletBaseUrl, {
                page: page - 1,
                location: selectedLocation,
                date: dateOption
            });

            html += `<a href="${escapeHtml(prevUrl)}" style="margin-right:10px;">Prev</a>`;
        }

        html += ` &nbsp; Page ${page} of ${totalPages || 1} &nbsp; `;

        if (page < totalPages) {
            const nextUrl = appendParamsToUrl(currentSuiteletBaseUrl, {
                page: page + 1,
                location: selectedLocation,
                date: dateOption
            });

            html += `<a href="${escapeHtml(nextUrl)}">Next</a>`;
        }

        html += `
            </div>
            <script>
                const bulkPrintBaseUrl = ${JSON.stringify(bulkPrintBaseUrl)};

                function toggleAll(source) {
                    document.querySelectorAll('.waveCheckbox').forEach((checkbox) => {
                        checkbox.checked = source.checked;
                    });
                }

                function bulkPrint() {
                    const selected = Array.from(document.querySelectorAll('.waveCheckbox:checked'));

                    if (!selected.length) {
                        alert('Select at least one wave');
                        return;
                    }

                    const ids = selected.map((checkbox) => checkbox.value).join(',');
                    const separator = bulkPrintBaseUrl.indexOf('?') === -1 ? '?' : '&';

                    window.open(
                        bulkPrintBaseUrl + separator + 'waveids=' + encodeURIComponent(ids),
                        '_blank'
                    );
                }

                setTimeout(() => {
                    window.location.reload();
                }, 600000);
            </script>
        </div>
        `;

        form.addField({
            id: 'custpage_html',
            type: ui.FieldType.INLINEHTML,
            label: 'HTML'
        }).defaultValue = html;

        context.response.writePage(form);
    };

    return { onRequest };
});
