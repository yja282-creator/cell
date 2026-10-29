import test from 'node:test';
import assert from 'node:assert/strict';
import { stages,chromosomes,segregation,sceneState } from '../model.js';

test('mitosis covers all six phases in biological order',()=>{
 assert.deepEqual(stages.mitosis.map(s=>s.id),['inter','pro','meta','ana','telo','cyto']);
 assert.equal(stages.mitosis.at(-1).dna,'세포당 2C');
});
test('meiosis has one replication phase and two complete divisions',()=>{
 assert.deepEqual(stages.meiosis.map(s=>s.id),['inter','pro1','meta1','ana1','telo1','cyto1','pro2','meta2','ana2','telo2','cyto2']);
 assert.equal(stages.meiosis.filter(s=>s.id==='inter').length,1);
 assert.equal(stages.meiosis.at(-1).dna,'세포당 1C');
});
test('mitosis gives each daughter a full diploid chromosome complement',()=>{
 for(const group of segregation('mitosis'))assert.deepEqual(group,[0,1,2,3]);
 assert.equal(sceneState('mitosis',5,1).cells,2);
});
test('meiosis I separates homologs, preserving one of each pair in each cell',()=>{
 const groups=segregation('meiosis');
 assert.deepEqual(groups.flat().sort(),[0,1,2,3]);
 for(const group of groups){
  assert.equal(group.length,2);
  assert.deepEqual(group.map(id=>chromosomes[id].length).sort(),[28,40]);
  for(const id of group)assert.ok(!group.includes(chromosomes[id].homolog));
 }
});
test('meiosis II separates all eight chromatids into four haploid daughters',()=>{
 const groups=segregation('meiosis',true);
 assert.equal(groups.length,4);
 assert.ok(groups.every(g=>g.length===2));
 const chromatids=groups.flat().map(c=>`${c.id}:${c.sister}`);
 assert.equal(new Set(chromatids).size,8);
 assert.equal(sceneState('meiosis',10,1).cells,4);
});
test('stage metadata includes distinct anaphase counts and explanatory content',()=>{
 assert.equal(stages.mitosis[3].count,'8개 · 극당 4개');
 assert.equal(stages.meiosis[3].count,'총 4개 · 극당 2개');
 assert.equal(stages.meiosis[8].count,'세포당 4개 · 극당 2개');
 for(const stage of [...stages.mitosis,...stages.meiosis])for(const key of ['name','chromosome','spindle','takeaway','count','dna'])assert.ok(stage[key]);
});
test('scene state clamps out-of-range stage and progress values',()=>{
 assert.equal(sceneState('mitosis',-1,-1).stage.id,'inter');
 assert.equal(sceneState('mitosis',99,3).p,1);
 assert.equal(sceneState('meiosis',6,.5).second,true);
});
