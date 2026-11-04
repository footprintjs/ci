const pathKey=unit=>`${unit.path}\0${unit.key}`;

function add(index,key,unit){
  if(!index.has(key))index.set(key,new Set());
  index.get(key).add(unit);
}

export function unitIndex(units){
  const index={remaining:new Set(units),byPath:new Map(),byKey:new Map()};
  for(const unit of units){add(index.byPath,pathKey(unit),unit);add(index.byKey,unit.key,unit);}
  return index;
}

export function retainedGroup(index,unit){return index.byPath.get(pathKey(unit))??new Set();}

export function removeUnit(index,unit){
  index.remaining.delete(unit);
  index.byPath.get(pathKey(unit)).delete(unit);
  index.byKey.get(unit.key).delete(unit);
}
