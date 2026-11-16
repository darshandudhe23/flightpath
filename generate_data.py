"""Builds data/airports.json and data/flights.json (illustrative weights, deterministic)."""
import json, math, zlib, pathlib
A = [  # code, name, city, country, lat, lon
("DEL","Indira Gandhi International","Delhi","India",28.5562,77.1000),
("BOM","Chhatrapati Shivaji Maharaj International","Mumbai","India",19.0896,72.8656),
("BLR","Kempegowda International","Bengaluru","India",13.1986,77.7066),
("MAA","Chennai International","Chennai","India",12.9941,80.1709),
("CCU","Netaji Subhas Chandra Bose International","Kolkata","India",22.6547,88.4467),
("HYD","Rajiv Gandhi International","Hyderabad","India",17.2403,78.4294),
("PNQ","Pune International","Pune","India",18.5821,73.9197),
("AMD","Sardar Vallabhbhai Patel International","Ahmedabad","India",23.0772,72.6347),
("GOI","Dabolim","Goa","India",15.3808,73.8314),
("COK","Cochin International","Kochi","India",10.1520,76.4019),
("TRV","Trivandrum International","Thiruvananthapuram","India",8.4821,76.9201),
("JAI","Jaipur International","Jaipur","India",26.8242,75.8122),
("LKO","Chaudhary Charan Singh International","Lucknow","India",26.7606,80.8893),
("GAU","Lokpriya Gopinath Bordoloi International","Guwahati","India",26.1061,91.5859),
("IXC","Chandigarh International","Chandigarh","India",30.6735,76.7885),
("PAT","Jay Prakash Narayan International","Patna","India",25.5913,85.0880),
("BBI","Biju Patnaik International","Bhubaneswar","India",20.2444,85.8178),
("NAG","Dr. Babasaheb Ambedkar International","Nagpur","India",21.0922,79.0472),
("IDR","Devi Ahilya Bai Holkar","Indore","India",22.7218,75.8011),
("SXR","Sheikh ul-Alam International","Srinagar","India",33.9871,74.7742),
("DXB","Dubai International","Dubai","UAE",25.2532,55.3657),
("SIN","Changi","Singapore","Singapore",1.3644,103.9915),
("LHR","Heathrow","London","United Kingdom",51.4700,-0.4543),
("BKK","Suvarnabhumi","Bangkok","Thailand",13.6900,100.7501),
("KUL","Kuala Lumpur International","Kuala Lumpur","Malaysia",2.7456,101.7099)]
P = {a[0]: a for a in A}
E = """DEL-BOM DEL-BLR DEL-MAA DEL-CCU DEL-HYD DEL-JAI DEL-LKO DEL-AMD DEL-IXC DEL-SXR DEL-PAT DEL-GOI DEL-NAG
DEL-DXB DEL-LHR DEL-SIN DEL-BKK BOM-BLR BOM-MAA BOM-HYD BOM-PNQ BOM-GOI BOM-AMD BOM-COK BOM-CCU BOM-JAI BOM-IDR
BOM-NAG BOM-DXB BOM-LHR BOM-SIN BLR-MAA BLR-HYD BLR-COK BLR-GOI BLR-PNQ BLR-TRV BLR-BBI BLR-DXB BLR-SIN MAA-CCU
MAA-COK MAA-HYD MAA-TRV MAA-SIN MAA-KUL CCU-GAU CCU-BBI CCU-PAT CCU-HYD CCU-LKO CCU-BKK CCU-SIN HYD-NAG HYD-BBI
HYD-GOI HYD-DXB HYD-PNQ COK-DXB COK-TRV COK-GOI AMD-JAI AMD-IDR AMD-PNQ AMD-DXB JAI-IXC LKO-PAT NAG-IDR IXC-SXR
PNQ-GOI DXB-LHR DXB-SIN DXB-BKK SIN-KUL SIN-BKK SIN-LHR KUL-BKK KUL-DXB GAU-BKK*""".split()  # '*' = one-way
def hav(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[4], a[5], b[4], b[5]))
    h = math.sin((la2-la1)/2)**2 + math.cos(la1)*math.cos(la2)*math.sin((lo2-lo1)/2)**2
    return 6371*2*math.asin(math.sqrt(h))
def jit(key, lo, hi):  # deterministic pseudo-random factor so cost/time/distance rankings differ
    return lo + (zlib.crc32(key.encode()) % 1000)/1000*(hi-lo)
flights = []
for tok in E:
    one_way = tok.endswith("*"); u, v = tok.rstrip("*").split("-")
    d = round(hav(P[u], P[v])); intl = P[u][3] != P[v][3] or P[u][3] != "India"
    t = round(d/800*60 + 35 + jit(tok+"t", 0, 25))
    c = round((4500 if intl else 1800) + d*(5.2 if intl else 4.4)*jit(tok+"c", .8, 1.35), -1)
    flights.append({"from": u, "to": v, "distance_km": d, "time_min": t, "cost_inr": int(c), "bidirectional": not one_way})
root = pathlib.Path(__file__).resolve().parent.parent / "data"
(root/"airports.json").write_text(json.dumps([dict(zip(("code","name","city","country","lat","lon"), a)) for a in A], indent=1))
(root/"flights.json").write_text(json.dumps(flights, indent=1))
print(len(A), "airports,", len(flights), "connections")
