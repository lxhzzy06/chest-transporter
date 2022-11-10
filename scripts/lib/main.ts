import * as mc from '@minecraft/server';
const itemList: Array<[mc.ItemStack, number][]> = [];
let reset = 0;

function comparItems(items: Array<[mc.ItemStack, number]>, comparItems: Array<[mc.ItemStack, number]>): boolean {
  let equalCount = 0;
  if (items.length !== comparItems.length) return false;
  items.forEach((k, i) => {
    const [item, index] = k;
    const [comparItem, comparIndex] = comparItems[i];
    if (
      item.typeId === comparItem.typeId &&
      item.data === comparItem.data &&
      item.amount === comparItem.amount &&
      index === comparIndex + 27 &&
      item.getLore().toString() === comparItem.getLore().toString()
    ) {
      equalCount++;
    }
  });
  return equalCount === items.length;
}

function pullItem(
  container: mc.Container,
  player: mc.Player,
  horse?: boolean,
  double_chest?: Array<[mc.ItemStack, number]>
): void {
  reset++;
  let items: Array<[mc.ItemStack, number]> = [];
  if (double_chest) {
    items = double_chest;
  } else {
    for (let i = horse ? 1 : 0; i < container.size; i++)
      if (container.getItem(i)) items.push([container.getItem(i), i]);
  }

  player.runCommandAsync(`replaceitem entity @s slot.weapon.mainhand 0 mq:chest_transporter_chest 1 0`).then(() => {
    const container = (<mc.EntityInventoryComponent>player.getComponent('inventory')).container,
      item = container.getItem(player.selectedSlot);
    item.setLore([`索引：${itemList.push(items) - 1}`]);
    container.setItem(player.selectedSlot, item);
  });
}

function pushItem(container: mc.Container, player: mc.Player, double_chest?: boolean): void {
  reset--;
  const item = (<mc.EntityInventoryComponent>player.getComponent('inventory')).container.getItem(player.selectedSlot);
  itemList[parseInt(<string>/\d/.exec(item.getLore()[0])?.[0])].forEach((k) => {
    const itemIndex: number = double_chest ? k[1] + 27 : k[1];
    container.setItem(itemIndex, <mc.ItemStack>k[0]);
  });
  if (reset === 0) itemList.length = 0;
  player.runCommandAsync(`replaceitem entity @s slot.weapon.mainhand 0 mq:chest_transporter 1 0`);
}

function setTimeOut(fn: () => void, tick = 1): void {
  let tickIndex = 0;
  const tickEvent = () => {
    tickIndex++;
    if (tickIndex === tick) {
      fn();
      unsubscribe();
    }
  };
  mc.world.events.tick.subscribe(tickEvent);
  function unsubscribe() {
    mc.world.events.tick.unsubscribe(tickEvent);
  }
}

mc.world.events.beforeItemUseOn.subscribe((e) => {
  const block = e.source.dimension.getBlock(e.blockLocation),
    container = (<mc.EntityInventoryComponent>block.getComponent('inventory'))?.container,
    item = e.item;
  if (
    block.typeId === 'minecraft:chest' &&
    item.typeId === 'mq:chest_transporter' &&
    e.source.isSneaking &&
    e.source instanceof mc.Player
  ) {
    if (container.size === 54) {
      const blockDire = (<mc.DirectionBlockProperty>block.permutation.getProperty(`facing_direction`)).value,
        items_st: Array<[mc.ItemStack, number]> = [],
        items_nd: Array<[mc.ItemStack, number]> = [];
      for (let i = 0; i < container.size; i++) {
        if (container.getItem(i))
          i < 27 ? items_st.push([container.getItem(i), i]) : items_nd.push([container.getItem(i), i - 27]);
      }
      block.setType(mc.MinecraftBlockTypes.air);
      e.source.dimension.getEntitiesAtBlockLocation(block.location).forEach((k) => {
        if (k.typeId === `minecraft:item` && !k.rotation.x && !k.rotation.y) k.kill();
      });
      const locOffset = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1]
      ];
      for (let i = 0; i < locOffset.length; i++) {
        const chest = e.source.dimension.getBlock(block.location.offset(locOffset[i][0], 0, locOffset[i][1])),
          chestCoer = (<mc.EntityInventoryComponent>chest?.getComponent('inventory'))?.container,
          chestDire = (<mc.DirectionBlockProperty>chest?.permutation?.getProperty(`facing_direction`))?.value,
          chestItems: Array<[mc.ItemStack, number]> = [];
        if (chest?.typeId !== `minecraft:chest` || chestDire !== blockDire) continue;
        for (let i = 0; i < chestCoer.size; i++) {
          if (chestCoer.getItem(i)) chestItems.push([chestCoer.getItem(i), i - 27]);
        }
        if (comparItems(items_st, chestItems)) {
          pullItem(container, <mc.Player>e.source, false, items_nd);
          break;
        } else if (comparItems(items_nd, chestItems)) {
          pullItem(container, <mc.Player>e.source, false, items_st);
          break;
        } else {
          pullItem(container, <mc.Player>e.source, false, []);
          break;
        }
      }
    } else {
      pullItem(container, e.source, false);
      e.source.runCommandAsync(`setblock ${block.location.x} ${block.location.y} ${block.location.z} air 0 replace`);
    }
  }
});

mc.world.events.blockPlace.subscribe((e) => {
  const { block, player } = e,
    item = (<mc.EntityInventoryComponent>player.getComponent('inventory')).container.getItem(player.selectedSlot);
  if (block.typeId === 'minecraft:chest' && item.typeId === 'mq:chest_transporter_chest') {
    if ((<mc.EntityInventoryComponent>block.getComponent('inventory')).container.size === 54) {
      setTimeOut(() => {
        pushItem((<mc.EntityInventoryComponent>block.getComponent('inventory')).container, player, true);
      }, 1);
    } else {
      pushItem((<mc.EntityInventoryComponent>block.getComponent('inventory')).container, player);
    }
  }
});

mc.world.events.dataDrivenEntityTriggerEvent.subscribe(
  (e) => {
    const container = (<mc.EntityInventoryComponent>e.entity.getComponent('inventory'))?.container,
      player = Array.from(mc.world.getPlayers({ tags: [`transporter`] }))[0];
    switch (e.id) {
      case `add_chest_event`:
        pushItem(container, player);
        player.removeTag(`transporter`);
        break;

      case `remove_chest_event`:
        pullItem(
          container,
          player,
          (<mc.EntityInventoryComponent>e.entity.getComponent('inventory')).containerType === 'horse'
        );
        player.removeTag(`transporter`);
        break;
    }
  },
  {
    eventTypes: [`add_chest_event`, `remove_chest_event`],
    entityTypes: [
      `minecraft:donkey`,
      `minecraft:mule`,
      `minecraft:minecart`,
      `minecraft:chest_minecart`,
      `minecraft:boat`,
      `minecraft:chest_boat`
    ]
  }
);
