const trip=(id,vehicle,driver,start,end,distance)=>({id,vehicle_id:vehicle,driver_id:driver,driver_name:driver===1?'Élodie Mbuyi':'Jean Mukendi',plate:vehicle===1?'TEST 001':'RETIRÉ 002',make:'Toyota',model:'Hilux',start_at:start,end_at:end,start_km:1000,end_km:end?1000+distance:null,destination:id===1?'=SUM(1,2)':'Aéroport de N’djili',purpose:'Mission de service'});
const fill=(id,vehicle,at,mileage,ml,price,currency,full)=>({id,vehicle_id:vehicle,plate:vehicle===1?'TEST 001':'RETIRÉ 002',make:'Toyota',model:'Hilux',filled_at:at,mileage,liters_ml:ml,unit_price_milli:price,currency,full_tank:full,station:'Station de la Gombe'});
module.exports={today:'2026-10-08',now:'2026-10-08T16:00',timezone:'Africa/Lagos',demo:true,vehicles:[{id:1,plate:'TEST 001'}],movements:[
  trip(1,1,1,'2026-01-31 23:50:00','2026-02-01 01:00:00',100),
  trip(2,1,1,'2026-02-02 10:00:00',null,0),
  trip(3,2,2,'2026-02-10 10:00:00','2026-02-10 11:00:00',40),
  trip(4,1,1,'2025-12-31 23:50:00','2026-01-01 01:00:00',30),
],refuelings:[
  fill(1,1,'2025-12-20 10:00:00',1000,50000,1250,'USD',1),
  fill(2,1,'2026-01-15 10:00:00',1100,10001,1500,'USD',0),
  fill(3,1,'2026-02-05 10:00:00',1500,40000,2500000,'CDF',1),
  fill(4,2,'2026-02-08 10:00:00',1000,20000,1200,'USD',1),
]};
