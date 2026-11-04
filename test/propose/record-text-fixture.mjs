/** Test observation over reopened native DATA, so multiline/escaped text is not
 * accidentally compared with its JSON serialization. This is no runtime port. */
export function containsRecordText(value,needle){
 if(typeof needle!=='string'||!needle.length)throw new Error('nonempty-test-text-required');
 if(typeof value==='string')return value.includes(needle);
 if(value&&typeof value==='object')return Object.values(value).some(child=>containsRecordText(child,needle));
 return false;
}
