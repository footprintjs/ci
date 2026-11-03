/** Synthetic verified-facts DATA for offline ports. This is not helper execution,
 * authenticated source/identity, a writer grant or actual provider evidence. */
export function identityFactsFixture({context,clientId='offline-client'}={}){
 return {schemaVersion:1,verified:true,appId:5533048,appSlug:'agentfootprint-release',clientId,
  ownerId:266183199,ownerLogin:'footprintjs',ownerType:'Organization',
  repositoryId:context?.repository.id??123,sourceSha:context?.sha??'a'.repeat(40),
  runId:context?.runId??500,runAttempt:context?.runAttempt??1};
}
