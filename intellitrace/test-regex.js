const text = `intellishop_http_requests_total{method="GET",route="/cart",status_code="200"} 2
intellishop_http_errors_total 0
intellishop_http_request_duration_seconds_sum{method="GET"} 0.5`; 
const sumMetric = (name) => { 
    let sum = 0; 
    const regex = new RegExp('^' + name + '(?:{[^}]*})?\\s+([0-9.]+)', 'gm'); 
    let match; 
    while ((match = regex.exec(text)) !== null) { 
        sum += parseFloat(match[1]); 
    } 
    return sum; 
}; 
console.log('Req:', sumMetric('intellishop_http_requests_total')); 
console.log('Err:', sumMetric('intellishop_http_errors_total'));
