// export const environment = {
//   production: false,
//   apiBaseUrl : 'http://localhost:8090',
//   //apiBaseUrl: 'http://192.168.9.130:3031/vpms',
//   // apiBaseUrl : 'http://localhost:8090', //
//   apiKey: 'VPMS_SECRET_KEY_2026',
//   cvpsBaseUrl: 'http://localhost:3030/cvps',

// };
// export const environment = {
//   production: false,
//   // Update this to the actual host where the report API is running
//   apiBaseUrl: 'http://192.168.9.130:9092/vpms', 
//   cvpsBaseUrl: 'http://localhost:3030', // or whatever port your main backend uses
//   apiKey: 'YOUR_API_KEY'
// };
export const environment = {
  production: false,
  
  // External Report API
  apiBaseUrl: 'http://192.168.9.130:9092/vpms', 
  
  // Your Local Spring Boot Backend (Must include /cvps context path!)
  cvpsBaseUrl: 'http://localhost:3035/cvps', 
  
  apiKey: 'VPMS_SECRET_KEY_2026'
};